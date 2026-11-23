import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  backupsToPrune,
  type BackupInfo,
  type BackupPolicy,
  type BackupReason,
  type Role,
  type WorkspaceData,
} from '@board/shared';
import { pool, tx } from './db';
import { env } from './env';
import { fail, log } from './log';
import { firstRunToday } from './notificationMail';
import { addMember, createProject, listMembers } from './projects';
import { getWorkspace, notify } from './repo';
import { storageRoot } from './storage';
import type { Project } from './tenancy';

/**
 * Sauvegardes par projet. Chaque nuit, tout le contenu de chaque projet (réglages, cadrage,
 * réalisation, discussions, liste des membres) est écrit dans un fichier compressé, sauf s'il n'a
 * pas changé depuis la dernière sauvegarde. Une sauvegarde est aussi prise avant une restauration et
 * avant la suppression d'un projet. Les fichiers joints eux-mêmes ne sont pas copiés : ils restent
 * dans leur stockage ; l'historique des modifications non plus.
 */

/** Contenu d'un fichier de sauvegarde. */
export interface BackupFile extends WorkspaceData {
  format: 'ntech-board-backup';
  version: 1;
  project: { slug: string; title: string; subtitle: string };
  members: { email: string; name: string; role: Role }[];
}

/** Type d'élément de chaque liste d'un export, dans l'ordre de restauration. */
const KINDS: [keyof WorkspaceData, string][] = [
  ['references', 'reference'],
  ['epics', 'epic'],
  ['stories', 'story'],
  ['workshops', 'workshop'],
  ['phases', 'phase'],
  ['risks', 'risk'],
  ['diligences', 'diligence'],
  ['parties', 'party'],
  ['releases', 'release'],
  ['sprints', 'sprint'],
  ['tickets', 'ticket'],
  ['campaigns', 'campaign'],
  ['sources', 'source'],
  ['proposals', 'proposal'],
  ['comments', 'comment'],
  ['attachments', 'attachment'],
];

export const backupPolicy = (): BackupPolicy => ({
  hour: env.backup.hour,
  daily: env.backup.daily,
  weekly: env.backup.weekly,
  monthly: env.backup.monthly,
  safetyDays: env.backup.safetyDays,
});

const dir = () => join(storageRoot(), 'backups', 'projects');
const fileOf = (id: string) => join(dir(), `${id}.json.gz`);

interface Row {
  id: string;
  project_id: string | null;
  project_slug: string;
  project_title: string;
  reason: BackupReason;
  note: string;
  size: number;
  counts: Record<string, number>;
  by: string | null;
  created_at: Date;
  verified_at: Date;
}
const SELECT = `SELECT b.id, b.project_id, b.project_slug, b.project_title, b.reason, b.note, b.size, b.counts,
                       coalesce(nullif(u.name, ''), u.email) AS by, b.created_at, b.verified_at
                  FROM backups b LEFT JOIN users u ON u.id = b.created_by`;
const info = (r: Row): BackupInfo => ({
  id: r.id,
  projectSlug: r.project_slug,
  projectTitle: r.project_title,
  orphan: !r.project_id,
  reason: r.reason,
  note: r.note,
  size: r.size,
  counts: r.counts,
  by: r.by ?? '',
  createdAt: r.created_at.toISOString(),
  verifiedAt: r.verified_at.toISOString(),
});

/** Sauvegardes d'un projet, de la plus récente à la plus ancienne. */
export async function listBackups(projectId: string) {
  const { rows } = await pool.query<Row>(`${SELECT} WHERE b.project_id = $1 ORDER BY b.created_at DESC`, [
    projectId,
  ]);
  return rows.map(info);
}

/** Toutes les sauvegardes de la plateforme, y compris celles des projets supprimés. */
export async function listAllBackups() {
  const { rows } = await pool.query<Row>(`${SELECT} ORDER BY b.created_at DESC`);
  return rows.map(info);
}

/** Une sauvegarde ; avec `projectId`, seulement si elle est à ce projet. */
export async function findBackup(id: string, projectId?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query<Row>(`${SELECT} WHERE b.id = $1`, [id]);
  const r = rows[0];
  return r && (!projectId || r.project_id === projectId) ? info(r) : null;
}

/** Fichier compressé d'une sauvegarde, ou null s'il a disparu du disque. */
export const backupBytes = (id: string) => (existsSync(fileOf(id)) ? readFileSync(fileOf(id)) : null);

export function readBackup(id: string): BackupFile {
  const bytes = backupBytes(id);
  if (!bytes) throw new Error('Le fichier de cette sauvegarde est introuvable sur le serveur.');
  const data = JSON.parse(gunzipSync(bytes).toString('utf8')) as BackupFile;
  if (data.format !== 'ntech-board-backup') throw new Error('Ce fichier n’est pas une sauvegarde.');
  return data;
}

/**
 * Sauvegarde un projet. Une sauvegarde automatique dont le contenu est identique à la dernière
 * n'écrit rien : la dernière est simplement marquée « vérifiée » à cette date (renvoie null).
 */
export async function createBackup(
  project: Project,
  reason: BackupReason,
  userId: string | null = null,
  note = '',
): Promise<BackupInfo | null> {
  const data = await getWorkspace(project.id, project.planning);
  const members = (await listMembers(project.id)).map(m => ({ email: m.email, name: m.name, role: m.role }));
  const content: BackupFile = {
    format: 'ntech-board-backup',
    version: 1,
    project: { slug: project.slug, title: project.title, subtitle: project.subtitle },
    members,
    ...data,
  };
  const json = JSON.stringify(content);
  const checksum = createHash('sha256').update(json).digest('hex');
  if (reason === 'scheduled') {
    const last = await pool.query<{ id: string; checksum: string }>(
      'SELECT id, checksum FROM backups WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [project.id],
    );
    if (last.rows[0]?.checksum === checksum && existsSync(fileOf(last.rows[0].id))) {
      await pool.query('UPDATE backups SET verified_at = now() WHERE id = $1', [last.rows[0].id]);
      return null;
    }
  }
  const counts: Record<string, number> = { members: members.length };
  for (const [key] of KINDS) counts[key] = ((data[key] as unknown[] | undefined) ?? []).length;
  const bytes = gzipSync(json);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backups (project_id, project_slug, project_title, reason, note, size, checksum, counts, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [project.id, project.slug, project.title, reason, note, bytes.length, checksum, counts, userId],
  );
  mkdirSync(dir(), { recursive: true });
  try {
    writeFileSync(fileOf(rows[0].id), bytes);
  } catch (err) {
    await pool.query('DELETE FROM backups WHERE id = $1', [rows[0].id]);
    throw err;
  }
  return findBackup(rows[0].id);
}

export async function deleteBackup(id: string) {
  await pool.query('DELETE FROM backups WHERE id = $1', [id]);
  rmSync(fileOf(id), { force: true });
}

/** Écrit le contenu d'une sauvegarde dans un projet (dans une transaction ouverte). */
async function writeContent(
  c: Parameters<Parameters<typeof tx>[0]>[0],
  projectId: string,
  data: BackupFile,
  skip: string[],
) {
  let n = 0;
  for (const [key, kind] of KINDS) {
    if (skip.includes(kind)) continue;
    for (const [i, item] of ((data[key] as { id: string }[] | undefined) ?? []).entries()) {
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position, revision) VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT (project_id, kind, id) DO UPDATE SET data = EXCLUDED.data, position = EXCLUDED.position,
           revision = entities.revision + 1`,
        [projectId, kind, item.id, item, i],
      );
      n++;
    }
  }
  await c.query('UPDATE projects SET settings = $2, planning = $3 WHERE id = $1', [
    projectId,
    data.settings,
    data.planning ?? null,
  ]);
  return n;
}

/**
 * Ramène un projet à l'état d'une sauvegarde : son contenu et ses réglages sont remplacés. L'état
 * actuel est d'abord sauvegardé. Les membres et les fichiers joints ne changent pas.
 */
export async function restoreInPlace(project: Project, backupId: string, userId: string) {
  const data = readBackup(backupId);
  const safety = await createBackup(
    project,
    'before-restore',
    userId,
    `Avant le retour à la sauvegarde ${backupId.slice(0, 8)}`,
  );
  const restored = await tx(async c => {
    await c.query(`DELETE FROM entities WHERE project_id = $1 AND kind <> 'attachment'`, [project.id]);
    const n = await writeContent(c, project.id, data, ['attachment']);
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', 'restore-backup', $2, $3)`,
      [project.id, JSON.stringify({ backup: backupId, restored: n }), userId],
    );
    await notify(c, project.id, 'reload', 'restore-backup', userId);
    return n;
  });
  return { restored, safety: safety?.id ?? null };
}

/**
 * Recrée un projet à partir d'une sauvegarde, à une nouvelle adresse : contenu, réglages et, si
 * demandé, membres. Les fichiers joints ne sont pas repris (leurs fichiers ne sont pas dans la sauvegarde).
 */
export async function restoreAsProject(
  backupId: string,
  input: { slug: string; title: string; admin: string; members: boolean },
  userId: string,
) {
  const data = readBackup(backupId);
  const id = await createProject(input.slug, input.title, data.project.subtitle);
  const restored = await tx(c => writeContent(c, id, data, ['attachment']));
  await addMember(id, input.admin, 'admin', '', userId);
  let members = 0;
  if (input.members)
    for (const m of data.members)
      if (m.email.toLowerCase() !== input.admin.toLowerCase()) {
        await addMember(id, m.email, m.role, m.name, userId);
        members++;
      }
  return { restored, members };
}

/** Supprime les sauvegardes que la règle de conservation ne garde plus. */
export async function pruneBackups() {
  const all = await listAllBackups();
  const groups = new Map<string, BackupInfo[]>();
  // Les sauvegardes d'un projet supprimé sont regroupées par son ancienne adresse.
  for (const b of all) {
    const key = `${b.orphan ? 'x' : 'p'}:${b.projectSlug}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  let removed = 0;
  for (const list of groups.values())
    for (const id of backupsToPrune(list, backupPolicy())) {
      await deleteBackup(id);
      removed++;
    }
  return removed;
}

/** Sauvegarde tous les projets, puis applique la règle de conservation. */
export async function runBackups(reason: BackupReason = 'scheduled', userId: string | null = null) {
  const { rows } = await pool.query<Project>(
    'SELECT id, slug, title, subtitle, planning FROM projects ORDER BY slug',
  );
  let created = 0;
  let unchanged = 0;
  const failed: string[] = [];
  for (const p of rows)
    try {
      if (await createBackup(p, reason, userId)) created++;
      else unchanged++;
    } catch (err) {
      failed.push(p.slug);
      fail('sauvegardes', `Sauvegarde du projet « ${p.slug} » impossible`, err);
    }
  const removed = await pruneBackups();
  return { projects: rows.length, created, unchanged, removed, failed };
}

/** Sauvegarde quotidienne : vérifiée toutes les dix minutes, exécutée une fois par jour après l'heure dite. */
export function startBackupJobs() {
  if (!env.backup.enabled) return;
  let busy = false;
  const tick = async () => {
    if (busy || new Date().getHours() < env.backup.hour || !(await firstRunToday('backups-daily'))) return;
    busy = true;
    try {
      const r = await runBackups();
      log(
        'sauvegardes',
        `${r.created} projet(s) sauvegardé(s), ${r.unchanged} inchangé(s), ${r.removed} ancienne(s) supprimée(s)${r.failed.length ? `, échec : ${r.failed.join(', ')}` : ''}.`,
      );
    } finally {
      busy = false;
    }
  };
  setInterval(
    () => void tick().catch(err => fail('sauvegardes', 'Sauvegarde quotidienne interrompue', err)),
    600_000,
  ).unref();
  setTimeout(
    () => void tick().catch(err => fail('sauvegardes', 'Sauvegarde quotidienne interrompue', err)),
    20_000,
  ).unref();
}
