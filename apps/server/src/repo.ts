import type { Epic, EntityKind, EntityOf, Reference, Story, Workshop, WorkspaceData } from '@board/shared';
import { pool, tx, type Tx } from './db';

type Kind = EntityKind | 'reference';

/** Signale un changement aux autres instances et navigateurs (délivré à la validation). */
export const notify = (
  c: Tx,
  projectId: string,
  kind: EntityKind | 'reload',
  id: string,
  by: string | null,
) => c.query(`SELECT pg_notify('board_events', $1)`, [JSON.stringify({ projectId, kind, id, by })]);

export async function getEntity<K extends EntityKind>(projectId: string, kind: K, id: string) {
  const { rows } = await pool.query<{ data: EntityOf<K> }>(
    'SELECT data FROM entities WHERE project_id = $1 AND kind = $2 AND id = $3',
    [projectId, kind, id],
  );
  return rows[0]?.data ?? null;
}

export async function getWorkspace(projectId: string, planning: string | null): Promise<WorkspaceData> {
  const { rows } = await pool.query<{ kind: Kind; data: unknown }>(
    'SELECT kind, data FROM entities WHERE project_id = $1 ORDER BY kind, position, created_at',
    [projectId],
  );
  const of = <T>(k: Kind) => rows.filter(r => r.kind === k).map(r => r.data as T);
  return {
    planning,
    references: of<Reference>('reference'),
    epics: of<Epic>('epic'),
    stories: of<Story>('story'),
    workshops: of<Workshop>('workshop'),
  };
}

export class NotFound extends Error {}

/**
 * Modifie une entité sous verrou de ligne (SELECT … FOR UPDATE) : deux personnes qui changent
 * des champs différents au même moment ne s'écrasent pas. Journalise et notifie.
 */
export async function mutate<K extends EntityKind>(
  projectId: string,
  kind: K,
  id: string,
  userId: string,
  action: string,
  change: (data: EntityOf<K>) => EntityOf<K>,
  patch?: unknown,
): Promise<EntityOf<K>> {
  return tx(async c => {
    const { rows } = await c.query<{ data: EntityOf<K> }>(
      'SELECT data FROM entities WHERE project_id = $1 AND kind = $2 AND id = $3 FOR UPDATE',
      [projectId, kind, id],
    );
    if (!rows[0]) throw new NotFound(`${kind} ${id}`);
    const data = change(rows[0].data);
    await c.query(
      `UPDATE entities SET data = $4, revision = revision + 1, updated_at = now(), updated_by = $5
        WHERE project_id = $1 AND kind = $2 AND id = $3`,
      [projectId, kind, id, data, userId],
    );
    await c.query(
      'INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [projectId, kind, id, action, patch === undefined ? null : JSON.stringify(patch), userId],
    );
    await notify(c, projectId, kind, id, userId);
    return data;
  });
}

/** Prochain identifiant libre d'une épique : US-UC01-07. */
const nextStoryId = (ids: string[], epic: string) => {
  const prefix = `US-${epic}-`;
  const max = ids
    .filter(i => i.startsWith(prefix))
    .reduce((m, i) => Math.max(m, Number(i.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
};

export async function createStory(projectId: string, userId: string, build: (id: string) => Story) {
  return tx(async c => {
    // Verrou par projet : deux créations simultanées n'obtiennent pas le même numéro.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`stories:${projectId}`]);
    const probe = build('');
    const { rows } = await c.query<{ id: string; position: number }>(
      `SELECT id, position FROM entities WHERE project_id = $1 AND kind = 'story'`,
      [projectId],
    );
    const id = nextStoryId(
      rows.map(r => r.id),
      probe.epic,
    );
    const story = build(id);
    const position = rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
    await c.query(
      `INSERT INTO entities (project_id, kind, id, data, position, revision, updated_by) VALUES ($1, 'story', $2, $3, $4, 1, $5)`,
      [projectId, id, story, position, userId],
    );
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, user_id) VALUES ($1, 'story', $2, 'create', $3)`,
      [projectId, id, userId],
    );
    await notify(c, projectId, 'story', id, userId);
    return story;
  });
}

export async function deleteStory(projectId: string, userId: string, id: string) {
  await tx(async c => {
    const { rowCount } = await c.query(
      `DELETE FROM entities WHERE project_id = $1 AND kind = 'story' AND id = $2`,
      [projectId, id],
    );
    if (!rowCount) throw new NotFound(`story ${id}`);
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, user_id) VALUES ($1, 'story', $2, 'delete', $3)`,
      [projectId, id, userId],
    );
    await notify(c, projectId, 'story', id, userId);
  });
}

/** Historique d'une entité : qui a fait quoi, du plus récent au plus ancien. */
export async function history(projectId: string, kind: EntityKind, id: string, limit = 50) {
  const { rows } = await pool.query<{
    action: string;
    at: string;
    name: string | null;
    email: string | null;
  }>(
    `SELECT e.action, e.at, u.name, u.email FROM events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.project_id = $1 AND e.kind = $2 AND e.entity_id = $3 ORDER BY e.at DESC LIMIT $4`,
    [projectId, kind, id, limit],
  );
  return rows;
}
