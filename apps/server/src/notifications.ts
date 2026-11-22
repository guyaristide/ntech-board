import {
  canSeeDelivery,
  isDeliveryKind,
  type AppNotification,
  type FollowState,
  type NotificationFeed,
  type NotificationType,
  type Party,
  type Person,
  type Role,
} from '@board/shared';
import { pool } from './db';
import { getSettings } from './repo';

/**
 * Notifications : créer, regrouper, lire. Les règles (qui prévenir de quoi) sont dans
 * notificationRules.ts ; ici, le stockage et l'anti-rafale.
 */

/** Fenêtre de regroupement : des événements rapprochés sur un même sujet ne font qu'une notification. */
export const COALESCE_MINUTES = 15;

export interface Draft {
  type: NotificationType;
  target: { kind: string; id: string };
  title: string;
  body?: string;
  path: string;
  /** Sujet de regroupement ; par défaut le type et l'élément. */
  groupKey?: string;
  /**
   * Changement d'état (étape d'un ticket) : d'où l'on part et où l'on arrive. Si une notification
   * regroupée revient à son point de départ, elle est retirée : il ne s'est finalement rien passé.
   */
  change?: { from: string; to: string };
  /** Rappel à ne faire qu'une fois : ignoré si une notification du même sujet a déjà existé. */
  once?: boolean;
  /** Texte d'une notification regroupée, d'après son état de départ (« depuis À faire »). */
  bodyFrom?: (from: string) => string;
}

interface Member {
  userId: string;
  role: Role;
}

async function membersOf(projectId: string, userIds: string[]): Promise<Member[]> {
  if (!userIds.length) return [];
  const { rows } = await pool.query<{ user_id: string; role: Role }>(
    'SELECT user_id, role FROM memberships WHERE project_id = $1 AND user_id = ANY($2)',
    [projectId, userIds],
  );
  return rows.map(r => ({ userId: r.user_id, role: r.role }));
}

export async function allMembers(projectId: string, roles?: Role[]): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM memberships WHERE project_id = $1 AND ($2::text[] IS NULL OR role = ANY($2))',
    [projectId, roles ?? null],
  );
  return rows.map(r => r.user_id);
}

/** Membres mentionnables : le nom affiché, ou le début de l'adresse à défaut. */
export async function people(projectId: string): Promise<Person[]> {
  const { rows } = await pool.query<{ id: string; name: string; email: string }>(
    `SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = $1 ORDER BY lower(coalesce(nullif(u.name, ''), u.email))`,
    [projectId],
  );
  return rows.map(r => ({ userId: r.id, name: r.name || r.email.split('@')[0] }));
}

async function persons(projectId: string) {
  const { rows } = await pool.query<{ data: Party }>(
    `SELECT data FROM entities WHERE project_id = $1 AND kind = 'party'`,
    [projectId],
  );
  return rows.map(r => r.data);
}

/** Comptes derrière une partie prenante : la personne, ou celle qui tient le rôle. */
export async function usersOfParty(projectId: string, partyId: string): Promise<string[]> {
  if (!partyId) return [];
  const parties = await persons(projectId);
  const party = parties.find(p => p.id === partyId);
  const person = party?.type === 'role' ? parties.find(p => p.id === party.holder) : party;
  return person?.type === 'person' && person.userId ? [person.userId] : [];
}

// --- Suivi --------------------------------------------------------------------------------

export async function followState(
  projectId: string,
  userId: string,
  kind: string,
  id: string,
): Promise<FollowState> {
  const { rows } = await pool.query<{ state: 'following' | 'muted' }>(
    'SELECT state FROM subscriptions WHERE project_id = $1 AND user_id = $2 AND target_kind = $3 AND target_id = $4',
    [projectId, userId, kind, id],
  );
  return rows[0]?.state ?? 'none';
}

/** Choix explicite de la personne : suivre, mettre en sourdine, ou ne plus rien demander. */
export async function setFollow(
  projectId: string,
  userId: string,
  kind: string,
  id: string,
  state: FollowState,
) {
  if (state === 'none')
    await pool.query(
      'DELETE FROM subscriptions WHERE project_id = $1 AND user_id = $2 AND target_kind = $3 AND target_id = $4',
      [projectId, userId, kind, id],
    );
  else
    await pool.query(
      `INSERT INTO subscriptions (project_id, user_id, target_kind, target_id, state, reason)
       VALUES ($1, $2, $3, $4, $5, 'manual')
       ON CONFLICT (project_id, user_id, target_kind, target_id) DO UPDATE SET state = $5, reason = 'manual'`,
      [projectId, userId, kind, id, state],
    );
}

/** Abonnement automatique (auteur, commentateur, responsable) : ne défait jamais une sourdine choisie. */
export async function autoFollow(
  projectId: string,
  userIds: (string | null)[],
  kind: string,
  id: string,
  reason: string,
) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await pool.query(
    `INSERT INTO subscriptions (project_id, user_id, target_kind, target_id, state, reason)
     SELECT $1, m.user_id, $3, $4, 'following', $5 FROM memberships m
      WHERE m.project_id = $1 AND m.user_id = ANY($2)
     ON CONFLICT DO NOTHING`,
    [projectId, ids, kind, id, reason],
  );
}

export async function followers(projectId: string, kind: string, id: string): Promise<string[]> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM subscriptions
      WHERE project_id = $1 AND target_kind = $2 AND target_id = $3 AND state = 'following'`,
    [projectId, kind, id],
  );
  return rows.map(r => r.user_id);
}

async function muted(projectId: string, kind: string, id: string): Promise<Set<string>> {
  if (!kind) return new Set();
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM subscriptions
      WHERE project_id = $1 AND target_kind = $2 AND target_id = $3 AND state = 'muted'`,
    [projectId, kind, id],
  );
  return new Set(rows.map(r => r.user_id));
}

// --- Création -----------------------------------------------------------------------------

const signal = (projectId: string, userId: string) =>
  pool.query(`SELECT pg_notify('board_events', $1)`, [
    JSON.stringify({ projectId, kind: 'notification', id: userId, by: null }),
  ]);

/**
 * Prévient des membres. L'auteur de l'action n'est jamais prévenu de ce qu'il vient de faire ; un
 * élément de la Réalisation ne prévient que ceux qui la voient ; une sourdine est respectée (sauf
 * pour une mention : on a nommé la personne). `visibilityKind` : type qui décide de la visibilité
 * quand la cible est une pièce jointe.
 */
export async function notifyUsers(
  projectId: string,
  actor: { id: string | null; name: string },
  userIds: string[],
  draft: Draft,
  visibilityKind = draft.target.kind,
) {
  const wanted = [...new Set(userIds)].filter(id => id && id !== actor.id);
  if (!wanted.length) return;
  let members = await membersOf(projectId, wanted);
  if (isDeliveryKind(visibilityKind)) {
    const settings = await getSettings(projectId);
    const parties = (await persons(projectId)).filter(p => p.type === 'person');
    members = members.filter(m => canSeeDelivery(settings, { role: m.role, userId: m.userId }, parties));
  }
  if (draft.type !== 'mention') {
    const silent = await muted(projectId, draft.target.kind, draft.target.id);
    members = members.filter(m => !silent.has(m.userId));
  }
  const groupKey = draft.groupKey ?? `${draft.type}:${draft.target.kind}:${draft.target.id}`;
  for (const m of members) {
    if (draft.once) {
      const seen = await pool.query(
        'SELECT 1 FROM notifications WHERE project_id = $1 AND user_id = $2 AND group_key = $3 LIMIT 1',
        [projectId, m.userId, groupKey],
      );
      if (seen.rowCount) continue;
    }
    // Une notification récente, non lue et pas encore envoyée sur le même sujet : on la met à jour.
    const { rows } = await pool.query<{ id: string; data: { from?: string } }>(
      `SELECT id, data FROM notifications
        WHERE project_id = $1 AND user_id = $2 AND group_key = $3 AND read_at IS NULL
          AND emailed_at IS NULL AND updated_at > now() - make_interval(mins => $4)
        ORDER BY updated_at DESC LIMIT 1`,
      [projectId, m.userId, groupKey, COALESCE_MINUTES],
    );
    const open = rows[0];
    if (open && draft.change && open.data.from !== undefined && open.data.from === draft.change.to) {
      // Retour au point de départ : rien n'a changé pour la personne, la notification disparaît.
      await pool.query('DELETE FROM notifications WHERE id = $1', [open.id]);
    } else if (open) {
      await pool.query(
        `UPDATE notifications SET title = $2, body = $3, path = $4, actor_id = $5, actor_name = $6,
                count = count + 1, updated_at = now(), pushed_at = NULL
          WHERE id = $1`,
        [
          open.id,
          draft.title,
          (open.data.from !== undefined && draft.bodyFrom?.(open.data.from)) || (draft.body ?? ''),
          draft.path,
          actor.id,
          actor.name,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO notifications (project_id, user_id, type, target_kind, target_id, group_key, title, body,
                                    path, actor_id, actor_name, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          projectId,
          m.userId,
          draft.type,
          draft.target.kind,
          draft.target.id,
          groupKey,
          draft.title,
          draft.body ?? '',
          draft.path,
          actor.id,
          actor.name,
          draft.change ? { from: draft.change.from } : {},
        ],
      );
    }
    await signal(projectId, m.userId);
  }
}

// --- Lecture ------------------------------------------------------------------------------

interface Row {
  id: string;
  type: NotificationType;
  target_kind: string;
  target_id: string;
  title: string;
  body: string;
  path: string;
  actor_name: string;
  count: number;
  created_at: Date;
  updated_at: Date;
  read_at: Date | null;
}

export async function feed(projectId: string, userId: string, limit = 60): Promise<NotificationFeed> {
  const { rows } = await pool.query<Row>(
    `SELECT id, type, target_kind, target_id, title, body, path, actor_name, count, created_at, updated_at, read_at
       FROM notifications WHERE project_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT $3`,
    [projectId, userId, limit],
  );
  const unread = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM notifications WHERE project_id = $1 AND user_id = $2 AND read_at IS NULL',
    [projectId, userId],
  );
  return {
    unread: unread.rows[0].n,
    items: rows.map((r): AppNotification => ({
      id: String(r.id),
      type: r.type,
      target: { kind: r.target_kind, id: r.target_id },
      title: r.title,
      body: r.body,
      path: r.path,
      actorName: r.actor_name,
      count: r.count,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      readAt: r.read_at?.toISOString() ?? null,
    })),
  };
}

/** Marque comme lues : celles indiquées, ou toutes. */
export async function markRead(projectId: string, userId: string, ids: string[] | 'all') {
  await pool.query(
    `UPDATE notifications SET read_at = now()
      WHERE project_id = $1 AND user_id = $2 AND read_at IS NULL AND ($3::bigint[] IS NULL OR id = ANY($3))`,
    [projectId, userId, ids === 'all' ? null : ids],
  );
  await signal(projectId, userId);
}

/** Ouvrir la fiche d'un élément vaut lecture de ses notifications. */
export async function markTargetRead(projectId: string, userId: string, kind: string, id: string) {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET read_at = now()
      WHERE project_id = $1 AND user_id = $2 AND read_at IS NULL AND target_kind = $3 AND target_id = $4`,
    [projectId, userId, kind, id],
  );
  if (rowCount) await signal(projectId, userId);
}
