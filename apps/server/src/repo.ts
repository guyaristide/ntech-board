import {
  withSettingsDefaults,
  type Diligence,
  type Epic,
  type EntityKind,
  type EntityOf,
  type Phase,
  type Reference,
  type Risk,
  type Story,
  type Workshop,
  type WorkspaceData,
  type Party,
  type ProjectSettings,
  type Release,
  type Sprint,
  type Ticket,
  type Campaign,
} from '@board/shared';
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
    settings: await getSettings(projectId),
    parties: of<Party>('party'),
    planning,
    references: of<Reference>('reference'),
    epics: of<Epic>('epic'),
    stories: of<Story>('story'),
    workshops: of<Workshop>('workshop'),
    phases: of<Phase>('phase'),
    risks: of<Risk>('risk'),
    diligences: of<Diligence>('diligence'),
    releases: of<Release>('release'),
    sprints: of<Sprint>('sprint'),
    tickets: of<Ticket>('ticket'),
    campaigns: of<Campaign>('campaign'),
  };
}

export class NotFound extends Error {}

/** Réglages du projet, complétés des valeurs par défaut. */
export async function getSettings(projectId: string): Promise<ProjectSettings> {
  const { rows } = await pool.query<{ settings: Partial<ProjectSettings> }>(
    'SELECT settings FROM projects WHERE id = $1',
    [projectId],
  );
  return withSettingsDefaults(rows[0]?.settings);
}

/** Enregistre les réglages (journalisés) et fait recharger les navigateurs ouverts. */
export async function saveSettings(projectId: string, userId: string, settings: ProjectSettings, patch: unknown) {
  await tx(async c => {
    await c.query('UPDATE projects SET settings = $2 WHERE id = $1', [projectId, settings]);
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, 'project', '-', 'settings', $2, $3)`,
      [projectId, JSON.stringify(patch), userId],
    );
    await notify(c, projectId, 'reload', 'settings', userId);
  });
  return settings;
}

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

/**
 * Modifie plusieurs entités du même type dans une seule transaction (clôture de sprint, tickets
 * déplacés) ; les verrous sont pris dans l'ordre des identifiants. Les identifiants inconnus sont ignorés.
 */
export async function mutateMany<K extends EntityKind>(
  projectId: string,
  kind: K,
  ids: string[],
  userId: string,
  action: string,
  change: (data: EntityOf<K>) => EntityOf<K>,
  patch?: unknown,
): Promise<EntityOf<K>[]> {
  if (!ids.length) return [];
  return tx(async c => {
    const { rows } = await c.query<{ id: string; data: EntityOf<K> }>(
      'SELECT id, data FROM entities WHERE project_id = $1 AND kind = $2 AND id = ANY($3) ORDER BY id FOR UPDATE',
      [projectId, kind, ids],
    );
    const out: EntityOf<K>[] = [];
    for (const row of rows) {
      const data = change(row.data);
      await c.query(
        `UPDATE entities SET data = $4, revision = revision + 1, updated_at = now(), updated_by = $5
          WHERE project_id = $1 AND kind = $2 AND id = $3`,
        [projectId, kind, row.id, data, userId],
      );
      await c.query(
        'INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [projectId, kind, row.id, action, patch === undefined ? null : JSON.stringify(patch), userId],
      );
      await notify(c, projectId, kind, row.id, userId);
      out.push(data);
    }
    return out;
  });
}

/**
 * Modifie deux entités du même type dans une seule transaction (liaison entre deux US) :
 * les verrous sont pris dans l'ordre des identifiants, deux liaisons croisées ne s'interbloquent pas.
 */
export async function mutatePair<K extends EntityKind>(
  projectId: string,
  kind: K,
  ids: [string, string],
  userId: string,
  action: string,
  change: (a: EntityOf<K>, b: EntityOf<K>) => [EntityOf<K>, EntityOf<K>],
  patch?: unknown,
): Promise<[EntityOf<K>, EntityOf<K>]> {
  return tx(async c => {
    const { rows } = await c.query<{ id: string; data: EntityOf<K> }>(
      'SELECT id, data FROM entities WHERE project_id = $1 AND kind = $2 AND id = ANY($3) ORDER BY id FOR UPDATE',
      [projectId, kind, ids],
    );
    const [a, b] = ids.map(id => rows.find(r => r.id === id)?.data);
    if (!a || !b) throw new NotFound(`${kind} ${ids.join(', ')}`);
    const next = change(a, b);
    for (const [i, id] of ids.entries()) {
      await c.query(
        `UPDATE entities SET data = $4, revision = revision + 1, updated_at = now(), updated_by = $5
          WHERE project_id = $1 AND kind = $2 AND id = $3`,
        [projectId, kind, id, next[i], userId],
      );
      await c.query(
        'INSERT INTO events (project_id, kind, entity_id, action, patch, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [projectId, kind, id, action, patch === undefined ? null : JSON.stringify(patch), userId],
      );
      await notify(c, projectId, kind, id, userId);
    }
    return next;
  });
}

/** Prochain identifiant libre d'une épique : US-UC01-07. */
const nextStoryId = (ids: string[], epic: string) => nextId(ids, `US-${epic}-`);

/** Prochain identifiant libre pour un préfixe : P6, R29, RG-11, US-UC01-07. */
export const nextId = (ids: string[], prefix: string, width = 2) => {
  const max = ids
    .filter(i => i.startsWith(prefix))
    .reduce((m, i) => Math.max(m, Number(i.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
};

/**
 * Crée une entité en fin de liste. L'identifiant est choisi sous verrou par projet et par type :
 * deux créations simultanées n'obtiennent pas le même.
 */
export async function createEntity<K extends EntityKind>(
  projectId: string,
  userId: string,
  kind: K,
  pickId: (ids: string[]) => string,
  build: (id: string) => EntityOf<K>,
) {
  return tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${kind}:${projectId}`]);
    const { rows } = await c.query<{ id: string; position: number }>(
      'SELECT id, position FROM entities WHERE project_id = $1 AND kind = $2',
      [projectId, kind],
    );
    const id = pickId(rows.map(r => r.id));
    const data = build(id);
    const position = rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
    await c.query(
      `INSERT INTO entities (project_id, kind, id, data, position, revision, updated_by) VALUES ($1, $2, $3, $4, $5, 1, $6)`,
      [projectId, kind, id, data, position, userId],
    );
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, user_id) VALUES ($1, $2, $3, 'create', $4)`,
      [projectId, kind, id, userId],
    );
    await notify(c, projectId, kind, id, userId);
    return data;
  });
}

/** Crée plusieurs entités du même type dans une seule transaction (US passées en réalisation). */
export async function createMany<K extends EntityKind>(
  projectId: string,
  userId: string,
  kind: K,
  pickId: (ids: string[]) => string,
  builds: ((id: string) => EntityOf<K>)[],
) {
  if (!builds.length) return [];
  return tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${kind}:${projectId}`]);
    const { rows } = await c.query<{ id: string; position: number }>(
      'SELECT id, position FROM entities WHERE project_id = $1 AND kind = $2',
      [projectId, kind],
    );
    const ids = rows.map(r => r.id);
    let position = rows.reduce((m, r) => Math.max(m, r.position), 0);
    const out: EntityOf<K>[] = [];
    for (const build of builds) {
      const id = pickId(ids);
      ids.push(id);
      const data = build(id);
      await c.query(
        `INSERT INTO entities (project_id, kind, id, data, position, revision, updated_by) VALUES ($1, $2, $3, $4, $5, 1, $6)`,
        [projectId, kind, id, data, ++position, userId],
      );
      await c.query(
        `INSERT INTO events (project_id, kind, entity_id, action, user_id) VALUES ($1, $2, $3, 'create', $4)`,
        [projectId, kind, id, userId],
      );
      await notify(c, projectId, kind, id, userId);
      out.push(data);
    }
    return out;
  });
}

export const createStory = (projectId: string, userId: string, build: (id: string) => Story) =>
  createEntity(projectId, userId, 'story', ids => nextStoryId(ids, build('').epic), build);

export async function deleteEntity(projectId: string, userId: string, kind: EntityKind, id: string) {
  await tx(async c => {
    const { rowCount } = await c.query(
      `DELETE FROM entities WHERE project_id = $1 AND kind = $2 AND id = $3`,
      [projectId, kind, id],
    );
    if (!rowCount) throw new NotFound(`${kind} ${id}`);
    await c.query(
      `INSERT INTO events (project_id, kind, entity_id, action, user_id) VALUES ($1, $2, $3, 'delete', $4)`,
      [projectId, kind, id, userId],
    );
    await notify(c, projectId, kind, id, userId);
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
