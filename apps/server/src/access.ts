import type { MiddlewareHandler } from 'hono';
import { canSeeDelivery, type Party, type Role } from '@board/shared';
import type { AppEnv } from './auth';
import { pool } from './db';
import { getSettings } from './repo';

/**
 * Accès à la partie Réalisation : selon les réglages du projet (activation, rôles, organisations,
 * membres autorisés ou exclus). Évalué à chaque requête : un changement de réglage vaut tout de suite.
 */
export async function seesDelivery(projectId: string, role: Role | null, userId: string | null) {
  const settings = await getSettings(projectId);
  if (!settings.delivery.enabled || !role) return false;
  const { rows } = await pool.query<{ data: Party }>(
    `SELECT data FROM entities WHERE project_id = $1 AND kind = 'party' AND data->>'type' = 'person'`,
    [projectId],
  );
  return canSeeDelivery(settings, { role, userId }, rows.map(r => r.data));
}

/** Réservé aux membres qui voient la partie Réalisation (403 sinon). */
export const requireDelivery: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ok = await seesDelivery(c.get('project').id, c.get('role'), c.get('user')?.id ?? null);
  if (!ok) return c.json({ error: 'delivery_hidden' }, 403);
  await next();
};
