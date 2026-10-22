import { randomBytes } from 'node:crypto';
import {
  ATTACHABLE_KINDS,
  categoryOf,
  folderFor,
  isDeliveryKind,
  safeFileName,
  type AttachableKind,
  type Attachment,
  type EntityKind,
} from '@board/shared';
import { pool } from '../db';
import { createEntity, deleteEntity, getEntity, getSettings, mutate, onDelete } from '../repo';
import { driverFor, LOCAL, StoreUnavailable } from './backends';

/** Pièces jointes : envoi vers le stockage actif, lecture, suppression et transfert entre stockages. */

export const isAttachable = (kind: string): kind is AttachableKind =>
  (ATTACHABLE_KINDS as readonly string[]).includes(kind);

/** Les pièces jointes d'un élément de la Réalisation ne se montrent qu'à ceux qui la voient. */
export const isDeliveryAttachment = (a: Attachment | null) => !!a && isDeliveryKind(a.owner.kind);

export class Rejected extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 404 | 409 | 413 | 502 = 400,
  ) {
    super(message);
  }
}

/** Type MIME retenu : celui du navigateur s'il concorde avec l'extension, sinon un type neutre. */
function mimeOf(name: string, declared: string) {
  const cat = categoryOf(name);
  const family: Record<string, RegExp> = {
    images: /^image\//,
    pdf: /^application\/pdf$/,
    video: /^video\//,
    audio: /^audio\//,
  };
  if (cat && family[cat]) return family[cat].test(declared) ? declared : 'application/octet-stream';
  return declared && !/html|svg|javascript|xml/.test(declared) ? declared : 'application/octet-stream';
}

interface Upload {
  project: { id: string; slug: string };
  user: { id: string; name: string; email: string };
  owner: { kind: AttachableKind; id: string };
  file: File;
}

export async function addAttachment({ project, user, owner, file }: Upload): Promise<Attachment> {
  const settings = (await getSettings(project.id)).files;
  if (!(await getEntity(project.id, owner.kind as EntityKind, owner.id)))
    throw new Rejected('not_found', 'Élément introuvable.', 404);
  if (file.size > settings.maxMb * 1024 * 1024)
    throw new Rejected('too_large', `« ${file.name} » dépasse ${settings.maxMb} Mo.`, 413);
  if (!file.size) throw new Rejected('empty', `« ${file.name} » est vide.`);
  const cat = categoryOf(file.name);
  if (!cat || !settings.categories.includes(cat))
    throw new Rejected('type_refused', `Le type de « ${file.name} » n’est pas accepté dans ce projet.`);
  const name = safeFileName(file.name);
  const mime = mimeOf(file.name, file.type);
  const folder = folderFor(settings, {
    project: project.slug,
    kind: owner.kind,
    id: owner.id,
    author: user.email.split('@')[0],
  });
  const { driver } = await driverFor(project.id, settings.store).catch(err => {
    throw new Rejected(
      'store_unavailable',
      err instanceof StoreUnavailable ? err.message : 'Stockage indisponible.',
      502,
    );
  });
  const stored = await driver.put(folder, name, Buffer.from(await file.arrayBuffer()), mime).catch(err => {
    throw new Rejected(
      'store_failed',
      `Le stockage a refusé le fichier : ${err instanceof Error ? err.message : err}`,
      502,
    );
  });
  const created = createEntity(
    project.id,
    user.id,
    'attachment',
    () => `PJ-${randomBytes(6).toString('hex')}`,
    (id): Attachment => ({
      id,
      owner,
      name: file.name.slice(0, 200),
      mime,
      size: file.size,
      store: settings.store,
      key: stored.key,
      ...(stored.resource ? { resource: stored.resource } : {}),
      by: user.id,
      byName: user.name || user.email,
      at: new Date().toISOString(),
    }),
  );
  // Fichier déposé mais pièce jointe non enregistrée : on ne laisse rien d'orphelin dans le stockage.
  return created.catch(async err => {
    await driver.remove(stored).catch(() => undefined);
    throw err;
  });
}

/** Supprime le fichier du stockage (au mieux) puis la pièce jointe. */
export async function removeAttachment(projectId: string, userId: string, a: Attachment) {
  try {
    const { driver } = await driverFor(projectId, a.store);
    await driver.remove(a);
  } catch (err) {
    console.error(`Pièce jointe ${a.id} : fichier non supprimé du stockage ${a.store}`, err);
  }
  await deleteEntity(projectId, userId, 'attachment', a.id);
}

export async function attachmentsOf(projectId: string, kind: string, id: string) {
  const { rows } = await pool.query<{ data: Attachment }>(
    `SELECT data FROM entities WHERE project_id = $1 AND kind = 'attachment'
        AND data->'owner'->>'kind' = $2 AND data->'owner'->>'id' = $3`,
    [projectId, kind, id],
  );
  return rows.map(r => r.data);
}

// Un élément supprimé emporte ses pièces jointes.
onDelete(async (projectId, userId, kind, id) => {
  if (!isAttachable(kind)) return;
  for (const a of await attachmentsOf(projectId, kind, id)) await removeAttachment(projectId, userId, a);
});

/**
 * Transfère vers le stockage actif, par lots, les fichiers gardés ailleurs. Chaque fichier est copié,
 * la pièce jointe mise à jour, puis l'original supprimé. Renvoie ce qui reste à transférer.
 */
export async function migrateBatch(project: { id: string; slug: string }, userId: string, limit = 10) {
  const settings = (await getSettings(project.id)).files;
  const { rows } = await pool.query<{ data: Attachment }>(
    `SELECT data FROM entities WHERE project_id = $1 AND kind = 'attachment' AND data->>'store' <> $2
      ORDER BY created_at LIMIT $3`,
    [project.id, settings.store, limit],
  );
  const target = await driverFor(project.id, settings.store);
  const errors: string[] = [];
  let moved = 0;
  for (const { data: a } of rows) {
    try {
      const source = await driverFor(project.id, a.store);
      const body = Buffer.from(await new Response(await source.driver.get(a)).arrayBuffer());
      const folder = folderFor(settings, {
        project: project.slug,
        kind: a.owner.kind,
        id: a.owner.id,
        author: 'transfert',
        date: new Date(a.at),
      });
      const stored = await target.driver.put(folder, safeFileName(a.name), body, a.mime);
      await mutate(project.id, 'attachment', a.id, userId, 'move', x => {
        const { resource: _old, ...rest } = x;
        return {
          ...rest,
          store: settings.store,
          key: stored.key,
          ...(stored.resource ? { resource: stored.resource } : {}),
        };
      });
      await source.driver.remove(a).catch(() => undefined);
      moved++;
    } catch (err) {
      errors.push(`${a.name} : ${err instanceof Error ? err.message : err}`);
    }
  }
  const { rows: left } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM entities WHERE project_id = $1 AND kind = 'attachment' AND data->>'store' <> $2`,
    [project.id, settings.store],
  );
  return { moved, errors, remaining: Number(left[0].n) };
}

export { LOCAL };
