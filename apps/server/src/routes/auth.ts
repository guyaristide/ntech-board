import { Hono } from 'hono';
import { z } from 'zod';
import type { SessionInfo } from '@board/shared';
import { closeSession, hash, isSuperadmin, newToken, openSession, originOf, type AppEnv } from '../auth';
import { pool } from '../db';
import { env } from '../env';
import { sendLoginLink } from '../mail';
import { clientIp, fail, log } from '../log';
import { ensureUser } from '../projects';

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/session', c => {
  const p = c.get('project');
  const user = c.get('user');
  const info: SessionInfo = {
    project: { slug: p.slug, title: p.title, subtitle: p.subtitle, planning: p.planning },
    user,
    role: c.get('role'),
    superadmin: c.get('superadmin'),
  };
  return c.json(info);
});

const LoginBody = z.object({ email: z.email().max(200) });

/**
 * Demande de lien de connexion. La réponse est toujours la même, que l'adresse soit
 * membre du projet ou non, pour ne pas révéler qui y a accès.
 */
authRoutes.post('/auth/login', async c => {
  const parsed = LoginBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_email' }, 400);
  const email = parsed.data.email.trim().toLowerCase();
  const project = c.get('project');
  const { rows } = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id AND m.project_id = $2 WHERE lower(u.email) = $1`,
    [email, project.id],
  );
  let userId = rows[0]?.id;
  const superadmin = isSuperadmin(email);
  if (!userId && superadmin) userId = await ensureUser(email);
  if (userId)
    log(
      'connexion',
      `${email} sur « ${project.slug} » : demande de lien (${rows[0] ? 'membre' : 'super-administrateur'}) depuis ${clientIp(n => c.req.header(n))}.`,
    );
  // La réponse au navigateur est toujours la même ; les logs, eux, disent ce qui s'est passé.
  if (!userId)
    log(
      'connexion',
      `${email} sur « ${project.slug} » : ignoré, ni membre du projet ni dans SUPERADMIN_EMAILS.`,
    );
  if (userId) {
    // Au plus 5 liens par quart d'heure et par personne.
    const recent = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM login_tokens WHERE user_id = $1 AND created_at > now() - interval '15 minutes'`,
      [userId],
    );
    if (recent.rows[0].n < 5) {
      const token = newToken();
      await pool.query(
        `INSERT INTO login_tokens (token_hash, user_id, project_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
        [hash(token), userId, project.id, env.loginTokenMinutes],
      );
      const origin = originOf(c);
      try {
        await sendLoginLink(
          email,
          project.title,
          `${origin}/api/auth/callback?token=${token}`,
          origin,
          env.loginTokenMinutes,
        );
        log('connexion', `${email} sur « ${project.slug} » : lien envoyé.`);
      } catch (e) {
        fail('connexion', `Envoi du lien de connexion impossible (${email}) : ${(e as Error).message}`);
        return c.json({ error: 'mail_failed' }, 502);
      }
    } else {
      log(
        'connexion',
        `${email} sur « ${project.slug} » : ignoré, limite de 5 liens en 15 minutes atteinte.`,
      );
    }
  }
  return c.json({ ok: true });
});

authRoutes.get('/auth/callback', async c => {
  const token = c.req.query('token') ?? '';
  const project = c.get('project');
  const { rows } = await pool.query<{ user_id: string }>(
    `UPDATE login_tokens SET used_at = now()
      WHERE token_hash = $1 AND project_id = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hash(token), project.id],
  );
  if (!rows[0]) {
    log(
      'connexion',
      `lien invalide, expiré ou déjà utilisé sur « ${project.slug} » depuis ${clientIp(n => c.req.header(n))}.`,
    );
    return c.redirect('/connexion?erreur=lien');
  }
  await openSession(c, rows[0].user_id, project.id);
  const who = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [rows[0].user_id]);
  log(
    'connexion',
    `session ouverte pour ${who.rows[0]?.email ?? rows[0].user_id} sur « ${project.slug} » depuis ${clientIp(n => c.req.header(n))}.`,
  );
  return c.redirect('/');
});

authRoutes.post('/auth/logout', async c => {
  if (c.get('user'))
    log('connexion', `déconnexion de ${c.get('user')!.email} sur « ${c.get('project').slug} ».`);
  await closeSession(c);
  return c.json({ ok: true });
});

authRoutes.patch('/me', async c => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  const body = z
    .object({ name: z.string().trim().min(1).max(80) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'invalid' }, 400);
  await pool.query('UPDATE users SET name = $2 WHERE id = $1', [user.id, body.data.name]);
  return c.json({ ...user, name: body.data.name });
});
