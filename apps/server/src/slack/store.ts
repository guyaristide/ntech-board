import { SLACK_EVENT_GROUPS, type SlackEventGroup, type SlackStatus } from '@board/shared';
import { hash, newToken } from '../auth';
import { pool } from '../db';
import { canEncrypt, decrypt, encrypt } from '../files/crypto';

/**
 * Liaison Slack d'un projet : webhook entrant et secret de signature, chiffrés en base (ils ne sortent
 * de ce module que pour appeler Slack ou vérifier une signature), et comptes Slack reliés aux membres.
 */

export const WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,200}$/;

interface Row {
  webhook: string;
  webhook_hint: string;
  signing_secret: string;
  events: string[];
  last_error: string;
  last_sent_at: Date | null;
  updated_by: string;
  updated_at: Date;
}
const row = async (projectId: string) =>
  (await pool.query<Row>('SELECT * FROM slack_integrations WHERE project_id = $1', [projectId])).rows[0];

const groups = (events: string[]) => SLACK_EVENT_GROUPS.filter(g => events.includes(g)) as SlackEventGroup[];

export async function slackStatus(projectId: string, origin: string): Promise<SlackStatus> {
  const r = await row(projectId);
  const linked = await pool.query<{ slack_name: string; name: string; linked_at: Date }>(
    `SELECT s.slack_name, coalesce(nullif(u.name, ''), u.email) AS name, s.linked_at
       FROM slack_users s JOIN users u ON u.id = s.user_id
      WHERE s.project_id = $1 ORDER BY s.linked_at`,
    [projectId],
  );
  return {
    canEncrypt: canEncrypt(),
    webhook: r?.webhook ? r.webhook_hint : '',
    events: groups(r?.events ?? ['tickets', 'sprints', 'risks', 'comments']),
    lastError: r?.last_error ?? '',
    lastSentAt: r?.last_sent_at?.toISOString() ?? null,
    commands: !!r?.signing_secret,
    commandUrl: `${origin}/api/slack/command`,
    linked: linked.rows.map(l => ({
      slackName: l.slack_name,
      name: l.name,
      linkedAt: l.linked_at.toISOString(),
    })),
    updatedBy: r?.updated_by ?? '',
    updatedAt: r?.updated_at.toISOString() ?? null,
  };
}

/** Enregistre ce qui est fourni ; une chaîne vide retire le webhook ou le secret. */
export async function saveSlack(
  projectId: string,
  patch: { webhook?: string; signingSecret?: string; events?: SlackEventGroup[] },
  by: string,
) {
  await pool.query(
    `INSERT INTO slack_integrations (project_id, updated_by) VALUES ($1, $2)
     ON CONFLICT (project_id) DO UPDATE SET updated_by = $2, updated_at = now()`,
    [projectId, by],
  );
  if (patch.webhook !== undefined)
    await pool.query(
      `UPDATE slack_integrations SET webhook = $2, webhook_hint = $3, last_error = '' WHERE project_id = $1`,
      [
        projectId,
        patch.webhook ? encrypt(patch.webhook) : '',
        patch.webhook ? `…${patch.webhook.slice(-6)}` : '',
      ],
    );
  if (patch.signingSecret !== undefined)
    await pool.query('UPDATE slack_integrations SET signing_secret = $2 WHERE project_id = $1', [
      projectId,
      patch.signingSecret ? encrypt(patch.signingSecret) : '',
    ]);
  if (patch.events)
    await pool.query('UPDATE slack_integrations SET events = $2 WHERE project_id = $1', [
      projectId,
      groups(patch.events),
    ]);
  if (patch.webhook === '') await pool.query('DELETE FROM slack_outbox WHERE project_id = $1', [projectId]);
}

const reveal = (stored: string | undefined) => {
  if (!stored) return '';
  try {
    return decrypt(stored);
  } catch {
    return '';
  }
};

/** Webhook du projet en clair et familles publiées ; null si rien n'est à publier. */
export async function slackTarget(projectId: string) {
  const r = await row(projectId);
  const url = reveal(r?.webhook);
  return url ? { url, events: groups(r.events) } : null;
}

export const signingSecret = async (projectId: string) => reveal((await row(projectId))?.signing_secret);

export const noteSent = (projectId: string, error = '') =>
  pool.query(
    error
      ? 'UPDATE slack_integrations SET last_error = $2 WHERE project_id = $1'
      : `UPDATE slack_integrations SET last_error = '', last_sent_at = now() WHERE project_id = $1`,
    error ? [projectId, error] : [projectId],
  );

// Comptes reliés

/** Membre du projet relié à ce compte Slack, ou null. */
export async function linkedUser(projectId: string, team: string, slackUser: string) {
  const { rows } = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM slack_users WHERE project_id = $1 AND team_id = $2 AND slack_user = $3',
    [projectId, team, slackUser],
  );
  return rows[0]?.user_id ?? null;
}

/** Jeton à usage unique (30 minutes) pour relier un compte Slack depuis le tableau. */
export async function newLinkToken(projectId: string, team: string, slackUser: string, slackName: string) {
  const token = newToken();
  await pool.query('DELETE FROM slack_link_tokens WHERE expires_at < now()');
  await pool.query(
    `INSERT INTO slack_link_tokens (token_hash, project_id, team_id, slack_user, slack_name, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '30 minutes')`,
    [hash(token), projectId, team, slackUser, slackName],
  );
  return token;
}

const pending = async (projectId: string, token: string) =>
  (
    await pool.query<{ team_id: string; slack_user: string; slack_name: string }>(
      `SELECT team_id, slack_user, slack_name FROM slack_link_tokens
        WHERE token_hash = $1 AND project_id = $2 AND expires_at > now()`,
      [hash(token), projectId],
    )
  ).rows[0] ?? null;

export const linkRequest = async (projectId: string, token: string) =>
  (await pending(projectId, token))?.slack_name ?? null;

/** Relie le compte Slack du jeton au membre ; faux si le jeton est inconnu ou expiré. */
export async function confirmLink(projectId: string, token: string, userId: string) {
  const p = await pending(projectId, token);
  if (!p) return false;
  await pool.query(
    `INSERT INTO slack_users (project_id, team_id, slack_user, slack_name, user_id) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, team_id, slack_user) DO UPDATE SET user_id = $5, slack_name = $4, linked_at = now()`,
    [projectId, p.team_id, p.slack_user, p.slack_name, userId],
  );
  await pool.query('DELETE FROM slack_link_tokens WHERE token_hash = $1', [hash(token)]);
  return true;
}

export const unlink = (projectId: string, team: string, slackUser: string) =>
  pool.query('DELETE FROM slack_users WHERE project_id = $1 AND team_id = $2 AND slack_user = $3', [
    projectId,
    team,
    slackUser,
  ]);
