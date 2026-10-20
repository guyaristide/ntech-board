import { randomBytes } from 'node:crypto';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { canUseMcp } from '@board/shared';
import { hash, requireRole, type AppEnv } from '../auth';
import { getSettings } from '../repo';
import { pool } from '../db';
import { body } from './workspace';

/**
 * Jetons personnels d'accès (serveur MCP) : chaque membre gère les siens, sur le projet courant.
 * Le jeton n'est montré qu'à sa création ; seul son hash est conservé.
 */
export const tokenRoutes = new Hono<AppEnv>();

const TokenCreate = z.object({
  name: z.string().trim().min(1).max(80),
  days: z.number().int().min(1).max(366).nullable().default(90),
});

/** Gestion réservée à une session ouverte dans le navigateur : un jeton ne crée pas d'autres jetons. */
const browser = requireRole('viewer');
const noToken: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('apiToken'))
    return c.json({ error: 'forbidden', message: 'Gérez vos jetons depuis le tableau.' }, 403);
  await next();
};

/** Création et liste : réservées aux rôles qui ont l'accès MCP (réglages). Révoquer reste toujours possible. */
const allowed: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!canUseMcp(await getSettings(c.get('project').id), c.get('role')))
    return c.json(
      { error: 'mcp_disabled', message: 'L’accès MCP n’est pas ouvert à votre rôle sur ce projet.' },
      403,
    );
  await next();
};

tokenRoutes.get('/tokens', browser, noToken, async c => {
  const { rows } = await pool.query(
    `SELECT id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt", expires_at AS "expiresAt"
       FROM api_tokens WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [c.get('project').id, c.get('user')!.id],
  );
  return c.json(rows);
});

tokenRoutes.post('/tokens', browser, noToken, allowed, async c => {
  const input = await body(c.req, TokenCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const token = `brd_${randomBytes(24).toString('base64url')}`;
  const { rows } = await pool.query(
    `INSERT INTO api_tokens (project_id, user_id, name, token_hash, prefix, expires_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
     RETURNING id, name, prefix, created_at AS "createdAt", last_used_at AS "lastUsedAt", expires_at AS "expiresAt"`,
    [c.get('project').id, c.get('user')!.id, input.name, hash(token), token.slice(0, 8), input.days],
  );
  return c.json({ ...rows[0], token }, 201);
});

tokenRoutes.delete('/tokens/:id', browser, noToken, async c => {
  const id = c.req.param('id');
  if (!z.uuid().safeParse(id).success) return c.json({ error: 'not_found' }, 404);
  const { rowCount } = await pool.query(
    'DELETE FROM api_tokens WHERE id = $1 AND project_id = $2 AND user_id = $3',
    [id, c.get('project').id, c.get('user')!.id],
  );
  return rowCount ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});
