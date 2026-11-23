import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { SLUG_PATTERN, type BackupList } from '@board/shared';
import { type AppEnv } from '../auth';
import {
  backupBytes,
  backupPolicy,
  createBackup,
  deleteBackup,
  findBackup,
  listAllBackups,
  listBackups,
  restoreAsProject,
  restoreInPlace,
  runBackups,
} from '../backups';
import { fail, log } from '../log';
import { originFor } from '../notificationMail';
import { findProject } from '../tenancy';
import { audit } from './platformDetail';

const RESERVED = new Set(['boards', 'www', 'api', 'admin', 'app', 'mail']);

const download = (c: Context<AppEnv>, id: string, slug: string, at: string) => {
  const bytes = backupBytes(id);
  if (!bytes)
    return c.json({ error: 'file_missing', message: 'Le fichier de cette sauvegarde est introuvable.' }, 410);
  return c.body(bytes, 200, {
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="${slug}-${at.slice(0, 16).replace(/[:T]/g, '-')}.json.gz"`,
  });
};

/**
 * Sauvegardes d'un projet, pour ses administrateurs (montées sous /admin/backups, et donc aussi dans
 * la console) : liste, sauvegarde immédiate, téléchargement, retour à une sauvegarde, suppression.
 */
export const backupRoutes = new Hono<AppEnv>();

backupRoutes.get('/', async c =>
  c.json({ backups: await listBackups(c.get('project').id), policy: backupPolicy() } satisfies BackupList),
);

backupRoutes.post('/', async c => {
  const input = z
    .object({ note: z.string().trim().max(200).default('') })
    .safeParse(await c.req.json().catch(() => ({})));
  const p = c.get('project');
  try {
    const b = await createBackup(p, 'manual', c.get('user')!.id, input.success ? input.data.note : '');
    log('sauvegardes', `${c.get('user')!.email} sauvegarde le projet « ${p.slug} ».`);
    return c.json(b, 201);
  } catch (err) {
    fail('sauvegardes', `Sauvegarde de « ${p.slug} » impossible`, err);
    return c.json(
      { error: 'backup_failed', message: 'La sauvegarde n’a pas pu être écrite sur le serveur.' },
      500,
    );
  }
});

backupRoutes.get('/:id/download', async c => {
  const b = await findBackup(c.req.param('id'), c.get('project').id);
  return b ? download(c, b.id, b.projectSlug, b.createdAt) : c.json({ error: 'not_found' }, 404);
});

backupRoutes.post('/:id/restore', async c => {
  const p = c.get('project');
  const b = await findBackup(c.req.param('id'), p.id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  const input = z.object({ confirm: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!input.success || input.data.confirm !== p.slug)
    return c.json(
      { error: 'confirm_mismatch', message: 'Le nom saisi ne correspond pas à l’adresse du projet.' },
      400,
    );
  try {
    const r = await restoreInPlace(p, b.id, c.get('user')!.id);
    log('sauvegardes', `${c.get('user')!.email} ramène « ${p.slug} » à sa sauvegarde du ${b.createdAt}.`);
    return c.json(r);
  } catch (err) {
    fail('sauvegardes', `Restauration de « ${p.slug} » impossible`, err);
    return c.json({ error: 'restore_failed', message: (err as Error).message }, 422);
  }
});

backupRoutes.delete('/:id', async c => {
  const b = await findBackup(c.req.param('id'), c.get('project').id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  await deleteBackup(b.id);
  return c.json({ ok: true });
});

/** Console : toutes les sauvegardes, celles des projets supprimés comprises, et leur restauration ailleurs. */
export function registerPlatformBackups(app: Hono<AppEnv>) {
  app.get('/platform/backups', async c =>
    c.json({ backups: await listAllBackups(), policy: backupPolicy() } satisfies BackupList),
  );

  app.post('/platform/backups/run', async c => {
    const r = await runBackups('manual', c.get('user')!.id);
    await audit(
      c,
      'Sauvegarde de tous les projets',
      '',
      `${r.created} créée(s), ${r.failed.length} échec(s)`,
    );
    return c.json(r);
  });

  app.get('/platform/backups/:id/download', async c => {
    const b = await findBackup(c.req.param('id'));
    return b ? download(c, b.id, b.projectSlug, b.createdAt) : c.json({ error: 'not_found' }, 404);
  });

  app.delete('/platform/backups/:id', async c => {
    const b = await findBackup(c.req.param('id'));
    if (!b) return c.json({ error: 'not_found' }, 404);
    await deleteBackup(b.id);
    await audit(c, 'Sauvegarde supprimée', b.projectSlug, b.createdAt);
    return c.json({ ok: true });
  });

  /** Recrée un projet à partir d'une sauvegarde, à une nouvelle adresse. */
  app.post('/platform/backups/:id/restore-as', async c => {
    const b = await findBackup(c.req.param('id'));
    if (!b) return c.json({ error: 'not_found' }, 404);
    const input = z
      .object({
        slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN),
        title: z.string().trim().min(1).max(120),
        admin: z.email().max(200),
        members: z.boolean().default(false),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'invalid', message: 'Nom, adresse ou e-mail invalide.' }, 400);
    const { slug } = input.data;
    if (RESERVED.has(slug) || (await findProject(slug)))
      return c.json(
        { error: 'slug_taken', message: `L’adresse « ${slug} » est déjà prise ou réservée.` },
        409,
      );
    try {
      const r = await restoreAsProject(b.id, input.data, c.get('user')!.id);
      await audit(
        c,
        'Projet recréé depuis une sauvegarde',
        slug,
        `${b.projectSlug} du ${b.createdAt} · ${r.restored} contenus`,
      );
      return c.json({ slug, url: originFor(slug), ...r }, 201);
    } catch (err) {
      fail('sauvegardes', `Restauration de la sauvegarde ${b.id} impossible`, err);
      return c.json({ error: 'restore_failed', message: (err as Error).message }, 422);
    }
  });
}
