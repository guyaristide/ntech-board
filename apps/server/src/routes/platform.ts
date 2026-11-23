import { getCookie } from 'hono/cookie';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import {
  SLUG_PATTERN,
  type Attachment,
  type PlatformAdmin,
  type PlatformOverview,
  type PlatformUser,
  type SessionInfo,
} from '@board/shared';
import {
  closeSession,
  hash,
  isSuperadmin,
  newToken,
  openSession,
  originOf,
  refreshSuperadmins,
  sameOrigin,
  type AppEnv,
} from '../auth';
import { pool } from '../db';
import { env } from '../env';
import { driverFor } from '../files/backends';
import { canEncrypt } from '../files/crypto';
import { clientIp, fail, log } from '../log';
import { sendLoginLink } from '../mail';
import { originFor } from '../notificationMail';
import { addMember, createProject, ensureUser, settingsFrom } from '../projects';
import { pushEnabled } from '../push';
import { findProject, forgetProject } from '../tenancy';
import { adminRoutes } from './admin';
import { registerPlatformBackups } from './backups';
import { createBackup } from '../backups';
import { audit, registerPlatformDetail } from './platformDetail';

/**
 * Console de la plateforme, servie sur un hôte sans projet (boards.neiba-technologies.com) et
 * réservée aux super-administrateurs : tous les projets, leurs membres, leurs imports et exports,
 * les comptes, les opérations de bas niveau. L'administration d'un projet y est la même que dans le
 * projet lui-même (routes /admin), exposée pour n'importe lequel.
 */
export const platformApi = new Hono<AppEnv>().basePath('/api');

const COOKIE = 'board_session';
const BOARD = { slug: '', title: 'Console NTECH Board', subtitle: 'Plateforme', planning: null };
const startedAt = new Date().toISOString();

platformApi.onError((err, c) => {
  fail('console', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

/** Session de console : un cookie dont la session n'appartient à aucun projet. */
const session: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  c.set('role', null);
  c.set('superadmin', false);
  c.set('sessionHash', null);
  c.set('apiToken', null);
  const token = getCookie(c, COOKIE);
  if (token) {
    const { rows } = await pool.query<{ id: string; email: string; name: string }>(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id_hash = $1 AND s.project_id IS NULL AND s.expires_at > now()`,
      [hash(token)],
    );
    // Le droit est revérifié à chaque requête : retirer un super-administrateur vaut tout de suite.
    if (rows[0] && isSuperadmin(rows[0].email)) {
      c.set('user', rows[0]);
      c.set('role', 'admin');
      c.set('superadmin', true);
      c.set('sessionHash', hash(token));
    }
  }
  await next();
};
platformApi.use('*', sameOrigin, session);

platformApi.get('/session', c => {
  const info: SessionInfo = {
    project: BOARD,
    user: c.get('user'),
    role: c.get('role'),
    superadmin: c.get('superadmin'),
    platform: true,
  };
  return c.json(info);
});

/** Lien de connexion : envoyé aux seuls super-administrateurs ; la réponse ne dit pas qui l'est. */
platformApi.post('/auth/login', async c => {
  const parsed = z.object({ email: z.email().max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_email' }, 400);
  const email = parsed.data.email.trim().toLowerCase();
  const from = clientIp(n => c.req.header(n));
  if (!isSuperadmin(email)) {
    log('console', `${email} : demande ignorée, pas super-administrateur (depuis ${from}).`);
    return c.json({ ok: true });
  }
  const userId = await ensureUser(email);
  const recent = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_tokens WHERE user_id = $1 AND created_at > now() - interval '15 minutes'`,
    [userId],
  );
  if (recent.rows[0].n >= 5) return c.json({ ok: true });
  const token = newToken();
  await pool.query(
    `INSERT INTO login_tokens (token_hash, user_id, project_id, expires_at) VALUES ($1, $2, NULL, now() + make_interval(mins => $3))`,
    [hash(token), userId, env.loginTokenMinutes],
  );
  const origin = originOf(c);
  try {
    await sendLoginLink(
      email,
      BOARD.title,
      `${origin}/api/auth/callback?token=${token}`,
      origin,
      env.loginTokenMinutes,
    );
    log('console', `${email} : lien de connexion envoyé (depuis ${from}).`);
  } catch (e) {
    fail('console', `Envoi du lien de connexion impossible (${email}) : ${(e as Error).message}`);
    return c.json({ error: 'mail_failed' }, 502);
  }
  return c.json({ ok: true });
});

platformApi.get('/auth/callback', async c => {
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE login_tokens SET used_at = now()
      WHERE token_hash = $1 AND project_id IS NULL AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hash(c.req.query('token') ?? '')],
  );
  if (!rows[0]) return c.redirect('/connexion?erreur=lien');
  await openSession(c, rows[0].user_id, null);
  log('console', `session ouverte (compte ${rows[0].user_id}) depuis ${clientIp(n => c.req.header(n))}.`);
  return c.redirect('/');
});

platformApi.post('/auth/logout', async c => {
  await closeSession(c);
  return c.json({ ok: true });
});

// Tout ce qui suit demande une session de super-administrateur.
platformApi.use('/platform/*', async (c, next) => {
  if (!c.get('superadmin')) return c.json({ error: 'unauthenticated' }, 401);
  await next();
});

platformApi.get('/platform/overview', async c => {
  const { rows } = await pool.query<{
    slug: string;
    title: string;
    subtitle: string;
    created_at: Date;
    members: number;
    admins: string[] | null;
    stories: number;
    tickets: number;
    files: number;
    bytes: string;
    last_activity: Date | null;
    delivery: boolean | null;
    ai_key: boolean;
  }>(
    `SELECT p.slug, p.title, p.subtitle, p.created_at,
            (SELECT count(*)::int FROM memberships m WHERE m.project_id = p.id) AS members,
            (SELECT array_agg(u.email ORDER BY u.email) FROM memberships m JOIN users u ON u.id = m.user_id
              WHERE m.project_id = p.id AND m.role = 'admin') AS admins,
            (SELECT count(*)::int FROM entities e WHERE e.project_id = p.id AND e.kind = 'story') AS stories,
            (SELECT count(*)::int FROM entities e WHERE e.project_id = p.id AND e.kind = 'ticket') AS tickets,
            (SELECT count(*)::int FROM entities e WHERE e.project_id = p.id AND e.kind = 'attachment') AS files,
            (SELECT coalesce(sum((e.data->>'size')::bigint), 0) FROM entities e
              WHERE e.project_id = p.id AND e.kind = 'attachment') AS bytes,
            (SELECT max(at) FROM events v WHERE v.project_id = p.id) AS last_activity,
            (p.settings->'delivery'->>'enabled')::boolean AS delivery,
            EXISTS (SELECT 1 FROM ai_keys k WHERE k.project_id = p.id) AS ai_key
       FROM projects p ORDER BY lower(p.title)`,
  );
  const users = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM users');
  const size = await pool.query<{ n: string }>('SELECT pg_database_size(current_database()) AS n');
  const overview: PlatformOverview = {
    users: users.rows[0].n,
    projects: rows.map(r => ({
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      url: originFor(r.slug),
      createdAt: r.created_at.toISOString(),
      members: r.members,
      admins: r.admins ?? [],
      stories: r.stories,
      tickets: r.tickets,
      files: r.files,
      bytes: Number(r.bytes),
      lastActivity: r.last_activity?.toISOString() ?? null,
      delivery: !!r.delivery,
      aiKey: r.ai_key,
    })),
    health: {
      mail: !!env.mail.host,
      push: pushEnabled,
      secrets: canEncrypt(),
      version: (process.env.SOURCE_COMMIT ?? '').slice(0, 10),
      node: process.version,
      startedAt,
      databaseBytes: Number(size.rows[0].n),
      hosts: env.projectHosts,
    },
  };
  return c.json(overview);
});

const NewProject = z.object({
  slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).default(''),
  admin: z.email().max(200),
  from: z.string().max(60).optional(),
});
/** Adresses qui ne peuvent pas être celles d'un projet. */
const RESERVED = new Set(['boards', 'www', 'api', 'admin', 'app', 'mail']);

platformApi.post('/platform/projects', async c => {
  const input = NewProject.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'invalid', message: 'Nom, adresse ou e-mail invalide.' }, 400);
  const { slug, title, subtitle, admin, from } = input.data;
  if (RESERVED.has(slug) || (await findProject(slug)))
    return c.json({ error: 'slug_taken', message: `L’adresse « ${slug} » est déjà prise ou réservée.` }, 409);
  const id = await createProject(slug, title, subtitle);
  if (from)
    await pool.query('UPDATE projects SET settings = $2 WHERE id = $1', [id, await settingsFrom(from)]);
  await addMember(id, admin, 'admin', '', c.get('user')!.id);
  log('console', `${c.get('user')!.email} crée le projet « ${slug} » (administrateur ${admin}).`);
  await audit(c, 'Projet créé', slug, `administrateur ${admin}${from ? `, réglages de ${from}` : ''}`);
  return c.json({ slug, url: originFor(slug) }, 201);
});

/** Projet désigné dans l'adresse, ou 404. */
async function project(slug: string) {
  forgetProject(slug);
  return findProject(slug);
}

/** Lien de connexion à usage unique vers le projet : on y entre sans se reconnecter. */
platformApi.post('/platform/projects/:slug/open', async c => {
  const p = await project(c.req.param('slug'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  const token = newToken();
  await pool.query(
    `INSERT INTO login_tokens (token_hash, user_id, project_id, expires_at) VALUES ($1, $2, $3, now() + interval '2 minutes')`,
    [hash(token), c.get('user')!.id, p.id],
  );
  await audit(c, 'Projet ouvert', p.slug);
  return c.json({ url: `${originFor(p.slug)}/api/auth/callback?token=${token}` });
});

/** Change l'adresse d'un projet. Les sessions et abonnements liés à l'ancienne adresse ne suivent pas. */
platformApi.patch('/platform/projects/:slug', async c => {
  const input = z
    .object({ slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN) })
    .safeParse(await c.req.json().catch(() => null));
  const p = await project(c.req.param('slug'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  if (!input.success) return c.json({ error: 'invalid', message: 'Adresse invalide.' }, 400);
  const next = input.data.slug;
  if (next !== p.slug && (RESERVED.has(next) || (await findProject(next))))
    return c.json({ error: 'slug_taken', message: `L’adresse « ${next} » est déjà prise ou réservée.` }, 409);
  await pool.query('UPDATE projects SET slug = $2 WHERE id = $1', [p.id, next]);
  await pool.query('DELETE FROM sessions WHERE project_id = $1', [p.id]);
  await pool.query('DELETE FROM push_subscriptions WHERE project_id = $1', [p.id]);
  forgetProject(p.slug);
  forgetProject(next);
  log('console', `${c.get('user')!.email} change l’adresse du projet « ${p.slug} » en « ${next} ».`);
  await audit(c, 'Adresse du projet changée', p.slug, `devient ${next}`);
  return c.json({ slug: next, url: originFor(next) });
});

/** Déconnecte tout le monde du projet (sessions du tableau ; les jetons MCP restent). */
platformApi.post('/platform/projects/:slug/sessions/revoke', async c => {
  const p = await project(c.req.param('slug'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  const { rowCount } = await pool.query('DELETE FROM sessions WHERE project_id = $1', [p.id]);
  log('console', `${c.get('user')!.email} ferme ${rowCount} session(s) du projet « ${p.slug} ».`);
  await audit(c, 'Sessions du projet fermées', p.slug, `${rowCount} session(s)`);
  return c.json({ closed: rowCount ?? 0 });
});

/**
 * Supprime définitivement un projet : contenu, membres, jetons, réglages, puis ses fichiers dans les
 * stockages (au mieux). Le nom du projet doit être répété tel quel.
 */
platformApi.delete('/platform/projects/:slug', async c => {
  const p = await project(c.req.param('slug'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  const input = z.object({ confirm: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (!input.success || input.data.confirm !== p.slug)
    return c.json(
      { error: 'confirm_mismatch', message: 'Le nom saisi ne correspond pas à l’adresse du projet.' },
      400,
    );
  // Filet de sécurité : le contenu du projet reste restaurable depuis la console (Sauvegardes).
  try {
    await createBackup(p, 'before-delete', c.get('user')!.id);
  } catch (err) {
    fail('console', `Sauvegarde de « ${p.slug} » avant suppression impossible`, err);
    return c.json(
      {
        error: 'backup_failed',
        message: 'Le projet n’a pas pu être sauvegardé avant suppression : rien n’a été supprimé.',
      },
      500,
    );
  }
  const files = await pool.query<{ data: Attachment }>(
    `SELECT data FROM entities WHERE project_id = $1 AND kind = 'attachment'`,
    [p.id],
  );
  let lost = 0;
  for (const { data } of files.rows)
    await driverFor(p.id, data.store)
      .then(({ driver }) => driver.remove(data))
      .catch(() => lost++);
  await pool.query('DELETE FROM projects WHERE id = $1', [p.id]);
  forgetProject(p.slug);
  log(
    'console',
    `${c.get('user')!.email} supprime le projet « ${p.slug} » (${files.rowCount} fichier(s), ${lost} non retiré(s) du stockage).`,
  );
  await audit(c, 'Projet supprimé', p.slug, `${files.rowCount} fichier(s)`);
  return c.json({ deleted: p.slug, files: files.rowCount ?? 0, filesLeft: lost });
});

// Administration d'un projet depuis la console : membres, imports, exports, réglages repris.
platformApi.use('/platform/projects/:slug/admin/*', async (c, next) => {
  const p = await project(c.req.param('slug'));
  if (!p) return c.json({ error: 'not_found' }, 404);
  c.set('project', p);
  await next();
  // Toute écriture faite dans l'administration du projet est tracée (membres, imports, réglages).
  if (c.req.method !== 'GET' && c.res.status < 400) {
    const what = new URL(c.req.url).pathname.split('/admin/')[1] ?? '';
    await audit(c, `Administration : ${c.req.method} ${what}`, p.slug);
  }
});
platformApi.route('/platform/projects/:slug/admin', adminRoutes);

platformApi.get('/platform/users', async c => {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    name: string;
    last_login_at: Date | null;
    projects: { slug: string; title: string; role: string }[] | null;
  }>(
    `SELECT u.id, u.email, u.name, u.last_login_at,
            (SELECT json_agg(json_build_object('slug', p.slug, 'title', p.title, 'role', m.role) ORDER BY p.title)
               FROM memberships m JOIN projects p ON p.id = m.project_id WHERE m.user_id = u.id) AS projects
       FROM users u ORDER BY lower(u.email)`,
  );
  const users: PlatformUser[] = rows.map(r => ({
    userId: r.id,
    email: r.email,
    name: r.name,
    lastLoginAt: r.last_login_at?.toISOString() ?? null,
    superadmin: isSuperadmin(r.email),
    projects: r.projects ?? [],
  }));
  return c.json(users);
});

async function admins(): Promise<PlatformAdmin[]> {
  const { rows } = await pool.query<{ email: string; added_by: string; added_at: Date }>(
    'SELECT email, added_by, added_at FROM platform_admins ORDER BY email',
  );
  return [
    ...env.superadmins.map(email => ({ email, locked: true, addedBy: 'SUPERADMIN_EMAILS', addedAt: null })),
    ...rows
      .filter(r => !env.superadmins.includes(r.email))
      .map(r => ({ email: r.email, locked: false, addedBy: r.added_by, addedAt: r.added_at.toISOString() })),
  ];
}

platformApi.get('/platform/admins', async c => c.json(await admins()));

platformApi.post('/platform/admins', async c => {
  const input = z.object({ email: z.email().max(200) }).safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'invalid', message: 'Adresse e-mail invalide.' }, 400);
  const email = input.data.email.trim().toLowerCase();
  await pool.query('INSERT INTO platform_admins (email, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    email,
    c.get('user')!.email,
  ]);
  await refreshSuperadmins();
  log('console', `${c.get('user')!.email} désigne ${email} super-administrateur.`);
  await audit(c, 'Super-administrateur désigné', email);
  return c.json(await admins(), 201);
});

/** Retire un super-administrateur désigné dans la console ; ceux de SUPERADMIN_EMAILS ne se retirent pas. */
platformApi.delete('/platform/admins/:email', async c => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  if (env.superadmins.includes(email))
    return c.json(
      {
        error: 'locked',
        message: 'Ce super-administrateur vient de la configuration du serveur : il ne se retire pas d’ici.',
      },
      409,
    );
  await pool.query('DELETE FROM platform_admins WHERE email = $1', [email]);
  // Ses sessions de console tombent tout de suite.
  await pool.query(
    'DELETE FROM sessions WHERE project_id IS NULL AND user_id IN (SELECT id FROM users WHERE lower(email) = $1)',
    [email],
  );
  await refreshSuperadmins();
  log('console', `${c.get('user')!.email} retire ${email} des super-administrateurs.`);
  await audit(c, 'Super-administrateur retiré', email);
  return c.json(await admins());
});

registerPlatformDetail(platformApi);
registerPlatformBackups(platformApi);

platformApi.all('*', c => c.json({ error: 'not_found' }, 404));
