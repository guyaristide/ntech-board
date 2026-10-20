import { createHash, randomBytes } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { canUseMcp, type Role } from '@board/shared';
import { pool } from './db';
import { env } from './env';
import { getSettings } from './repo';
import { findProject, projectSlug, type Project } from './tenancy';

export const COOKIE = 'board_session';

export interface User {
  id: string;
  email: string;
  name: string;
}

export type AppEnv = {
  Variables: {
    project: Project;
    user: User | null;
    role: Role | null;
    superadmin: boolean;
    sessionHash: string | null;
    /** Requête authentifiée par un jeton personnel (serveur MCP, scripts) plutôt que par cookie. */
    apiToken: string | null;
  };
};

export const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const isSuperadmin = (email: string) => env.superadmins.includes(email.toLowerCase());

/** Origine publique de la requête, derrière le proxy de Coolify (Traefik). */
export function originOf(c: Context) {
  const proto =
    c.req.header('x-forwarded-proto')?.split(',')[0] ?? new URL(c.req.url).protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
  return `${proto}://${host}`;
}

const secure = (c: Context) =>
  env.cookieSecure === 'auto' ? originOf(c).startsWith('https') : env.cookieSecure === 'true';

/** Ouvre une session pour l'utilisateur sur le projet et pose le cookie (HttpOnly, propre au sous-domaine). */
export async function openSession(c: Context, userId: string, projectId: string) {
  const token = newToken();
  await pool.query(
    `INSERT INTO sessions (id_hash, user_id, project_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [hash(token), userId, projectId, env.sessionDays],
  );
  await pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secure(c),
    path: '/',
    maxAge: env.sessionDays * 86400,
  });
}

export async function closeSession(c: Context) {
  const h = c.get('sessionHash' as never) as string | null;
  if (h) await pool.query('DELETE FROM sessions WHERE id_hash = $1', [h]);
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Résout le projet (sous-domaine) puis l'utilisateur et son rôle (cookie de session). */
export const context: MiddlewareHandler<AppEnv> = async (c, next) => {
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '';
  const slug = projectSlug(host);
  const project = slug ? await findProject(slug) : null;
  // Diagnostic : l'hôte reçu et le projet déduit (null si l'hôte ne correspond à aucun modèle).
  if (!project) return c.json({ error: 'project_not_found', host, slug: slug ?? null }, 404);
  c.set('project', project);
  c.set('user', null);
  c.set('role', null);
  c.set('superadmin', false);
  c.set('sessionHash', null);
  c.set('apiToken', null);
  const bearer = c.req.header('authorization')?.match(/^Bearer\s+(brd_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (bearer) {
    await fromToken(c, project.id, bearer);
    return next();
  }
  const token = getCookie(c, COOKIE);
  if (token) {
    const h = hash(token);
    const { rows } = await pool.query<User & { role: Role | null; touch: boolean }>(
      `SELECT u.id, u.email, u.name, m.role, s.last_seen_at < now() - interval '1 hour' AS touch
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN memberships m ON m.user_id = u.id AND m.project_id = s.project_id
        WHERE s.id_hash = $1 AND s.project_id = $2 AND s.expires_at > now()`,
      [h, project.id],
    );
    const row = rows[0];
    if (row) {
      const superadmin = isSuperadmin(row.email);
      const role: Role | null = superadmin ? 'admin' : row.role;
      if (role) {
        c.set('user', { id: row.id, email: row.email, name: row.name });
        c.set('role', role);
        c.set('superadmin', superadmin);
        c.set('sessionHash', h);
        // Session glissante : prolongée au plus une fois par heure.
        if (row.touch)
          await pool.query(
            `UPDATE sessions SET last_seen_at = now(), expires_at = now() + make_interval(days => $2) WHERE id_hash = $1`,
            [h, env.sessionDays],
          );
      }
    }
  }
  await next();
};

/**
 * Jeton personnel : le membre et son rôle sur le projet du jeton. Un super-administrateur sans
 * adhésion agit en administrateur du projet, jamais en super-administrateur. Jeton inconnu,
 * expiré, d'un autre projet, ou d'un rôle sans accès MCP (réglages) : la requête reste anonyme
 * (401 sur les routes protégées).
 */
async function fromToken(c: Context<AppEnv>, projectId: string, token: string) {
  const { rows } = await pool.query<User & { role: Role | null; tid: string; touch: boolean }>(
    `SELECT u.id, u.email, u.name, m.role, t.id AS tid,
            (t.last_used_at IS NULL OR t.last_used_at < now() - interval '5 minutes') AS touch
       FROM api_tokens t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN memberships m ON m.user_id = u.id AND m.project_id = t.project_id
      WHERE t.token_hash = $1 AND t.project_id = $2 AND (t.expires_at IS NULL OR t.expires_at > now())`,
    [hash(token), projectId],
  );
  const row = rows[0];
  const role: Role | null = row ? (row.role ?? (isSuperadmin(row.email) ? 'admin' : null)) : null;
  if (!row || !role) return;
  // Accès MCP réservé aux rôles autorisés dans les réglages : sinon le jeton est inactif.
  if (!canUseMcp(await getSettings(projectId), role)) return;
  c.set('user', { id: row.id, email: row.email, name: row.name });
  c.set('role', role);
  c.set('apiToken', row.tid);
  if (row.touch) await pool.query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [row.tid]);
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

/** Exige un rôle minimal sur le projet courant. */
export const requireRole =
  (min: Role): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const role = c.get('role');
    if (!role) return c.json({ error: 'unauthenticated' }, 401);
    if (RANK[role] < RANK[min]) return c.json({ error: 'forbidden' }, 403);
    await next();
  };

/**
 * Protection CSRF : en plus du cookie SameSite=Lax, toute écriture doit venir du même hôte
 * (en-tête Origin) et porter un corps JSON ou multipart.
 */
export const sameOrigin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    const host = c.req.header('x-forwarded-host') ?? c.req.header('host');
    if (origin && new URL(origin).host !== host) return c.json({ error: 'bad_origin' }, 403);
  }
  await next();
};
