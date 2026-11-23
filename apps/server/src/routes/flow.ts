import { Hono } from 'hono';
import type { StatusChange } from '@board/shared';
import { requireDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { pool } from '../db';

/** Historique des changements d'étape des tickets : la matière des indicateurs de flux. */
export const flowRoutes = new Hono<AppEnv>();

flowRoutes.get('/flow/status-changes', requireRole('viewer'), requireDelivery, async c => {
  const project = (c.get('project') as { id: string }).id;
  const { rows } = await pool.query<StatusChange>(
    `SELECT entity_id AS ticket, at, patch->>'status' AS status
       FROM events
      WHERE project_id = $1 AND kind = 'ticket' AND patch ? 'status'
      ORDER BY id`,
    [project],
  );
  return c.json(rows);
});
