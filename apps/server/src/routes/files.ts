import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { MAX_FILE_MB, previewable, type Attachment } from '@board/shared';
import { seesDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { canEncrypt, SecretsKeyMissing } from '../files/crypto';
import {
  createBackend,
  deleteBackend,
  driverFor,
  listBackends,
  localUsage,
  LOCAL,
  updateBackend,
} from '../files/backends';
import {
  addAttachment,
  isAttachable,
  isDeliveryAttachment,
  migrateBatch,
  Rejected,
  removeAttachment,
} from '../files/attachments';
import { fail } from '../log';
import { getEntity, getSettings } from '../repo';
import { body } from './workspace';

/** Pièces jointes (envoi, lecture, suppression) et stockages du projet (administrateurs). */
export const fileRoutes = new Hono<AppEnv>();

fileRoutes.onError((err, c) => {
  if (err instanceof Rejected) return c.json({ error: err.code, message: err.message }, err.status);
  if (err instanceof SecretsKeyMissing)
    return c.json(
      {
        error: 'secrets_key_missing',
        message: 'Le serveur n’a pas de clé SECRETS_KEY : impossible d’enregistrer une clé secrète.',
      },
      400,
    );
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

type Ctx = { get: (k: 'project' | 'user' | 'role') => unknown };
const who = (c: Ctx) => ({
  project: c.get('project') as { id: string; slug: string },
  user: c.get('user') as { id: string; name: string; email: string },
});

/** La pièce jointe existe et le membre peut voir l'élément qui la porte. */
async function visible(c: Ctx, id: string) {
  const { project, user } = who(c);
  const a = await getEntity(project.id, 'attachment', id);
  if (!a) return null;
  if (isDeliveryAttachment(a) && !(await seesDelivery(project.id, c.get('role') as never, user.id)))
    return null;
  return a;
}

// --- Pièces jointes ---------------------------------------------------------------------

fileRoutes.post(
  '/attachments',
  requireRole('editor'),
  bodyLimit({
    maxSize: MAX_FILE_MB * 1024 * 1024 + 64 * 1024,
    onError: c =>
      c.json({ error: 'too_large', message: `Un fichier ne peut pas dépasser ${MAX_FILE_MB} Mo.` }, 413),
  }),
  async c => {
    const form = await c.req.parseBody();
    const file = form.file;
    const kind = String(form.kind ?? '');
    const id = String(form.id ?? '');
    if (!(file instanceof File) || !isAttachable(kind) || !id) return c.json({ error: 'invalid' }, 400);
    const { project, user } = who(c);
    if (
      isDeliveryAttachment({ owner: { kind } } as Attachment) &&
      !(await seesDelivery(project.id, c.get('role'), user.id))
    )
      return c.json({ error: 'delivery_hidden' }, 403);
    return c.json(await addAttachment({ project, user, owner: { kind, id }, file }), 201);
  },
);

/**
 * Contenu d'une pièce jointe. `?apercu=1` l'affiche dans le navigateur quand c'est sans risque
 * (images, PDF, vidéo, son) ; sinon il est téléchargé. Lien direct signé si le stockage est réglé ainsi.
 */
fileRoutes.get('/attachments/:id/fichier', requireRole('viewer'), async c => {
  const a = await visible(c, c.req.param('id'));
  if (!a) return c.json({ error: 'not_found' }, 404);
  const inline = c.req.query('apercu') === '1' && previewable(a.mime);
  const { driver, direct } = await driverFor(who(c).project.id, a.store);
  if (direct && driver.link)
    return c.redirect(await driver.link(a, { name: a.name, mime: a.mime, inline }), 302);
  const stream = await driver.get(a).catch(() => null);
  if (!stream) return c.json({ error: 'missing', message: 'Fichier introuvable dans le stockage.' }, 404);
  const ascii = a.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return c.body(stream, 200, {
    'Content-Type': inline ? a.mime : 'application/octet-stream',
    'Content-Length': String(a.size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    'Cache-Control': 'private, max-age=300',
  });
});

fileRoutes.delete('/attachments/:id', requireRole('editor'), async c => {
  const a = await visible(c, c.req.param('id'));
  if (!a) return c.json({ error: 'not_found' }, 404);
  const { project, user } = who(c);
  await removeAttachment(project.id, user.id, a);
  return c.json({ ok: true });
});

// --- Stockages (administrateurs) --------------------------------------------------------

const admin = requireRole('admin');
const text = (max: number) => z.string().trim().max(max);
const BackendBody = z.object({
  provider: z.enum(['cloudinary', 's3']),
  name: text(80).min(1),
  config: z.record(z.string(), z.union([text(300), z.boolean()])),
  secret: text(500).optional(),
  delivery: z.enum(['proxy', 'direct']).default('proxy'),
});
const BackendPatch = BackendBody.omit({ provider: true }).partial().strict();

fileRoutes.get('/files/storage', admin, async c => {
  const id = who(c).project.id;
  return c.json({ backends: await listBackends(id), local: await localUsage(id), canEncrypt: canEncrypt() });
});

fileRoutes.post('/files/backends', admin, async c => {
  const input = await body(c.req, BackendBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  return c.json({ id: await createBackend(who(c).project.id, input) }, 201);
});

fileRoutes.patch('/files/backends/:id', admin, async c => {
  const input = await body(c.req, BackendPatch);
  if (!input) return c.json({ error: 'invalid' }, 400);
  if (!(await updateBackend(who(c).project.id, c.req.param('id'), input)))
    return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

fileRoutes.delete('/files/backends/:id', admin, async c => {
  const projectId = who(c).project.id;
  const id = c.req.param('id');
  const b = (await listBackends(projectId)).find(x => x.id === id);
  if (!b) return c.json({ error: 'not_found' }, 404);
  if ((await getSettings(projectId)).files.store === id)
    return c.json(
      { error: 'active', message: 'C’est le stockage actif : choisissez-en un autre d’abord.' },
      409,
    );
  if (b.files)
    return c.json(
      {
        error: 'in_use',
        message: `${b.files} fichier(s) y sont encore : transférez-les vers le stockage actif d’abord.`,
      },
      409,
    );
  await deleteBackend(projectId, id);
  return c.json({ ok: true });
});

/** Essai d'un stockage : dépose un petit fichier, le relit puis le supprime. */
fileRoutes.post('/files/backends/:id/test', admin, async c => {
  const { project } = who(c);
  const started = Date.now();
  try {
    const { driver } = await driverFor(project.id, c.req.param('id'));
    const root = (await getSettings(project.id)).files.root || 'ntech-board';
    const content = `NTECH Board, essai du ${new Date().toISOString()}`;
    const stored = await driver.put(
      `${root}/${project.slug}/essai`,
      'essai.txt',
      Buffer.from(content),
      'text/plain',
    );
    const back = await new Response(await driver.get(stored)).text();
    await driver.remove(stored);
    if (back !== content) throw new Error('le fichier relu ne correspond pas');
    return c.json({ ok: true, ms: Date.now() - started });
  } catch (err) {
    return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

/** Transfert vers le stockage actif des fichiers gardés ailleurs, par lots (à rappeler tant qu'il en reste). */
fileRoutes.post('/files/migrate', admin, async c => {
  const { project, user } = who(c);
  return c.json(await migrateBatch(project, user.id));
});

export { LOCAL };
