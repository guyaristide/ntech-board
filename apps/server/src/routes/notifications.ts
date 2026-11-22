import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole, type AppEnv } from '../auth';
import { feed, followState, markRead, markTargetRead, people, setFollow } from '../notifications';
import '../notificationRules';
import { body } from './workspace';

/** Notifications de la personne connectée, suivi d'un élément, et annuaire des membres à mentionner. */
export const notificationRoutes = new Hono<AppEnv>();

const read = requireRole('viewer');
const ids = (c: { get: (k: 'project' | 'user') => unknown }) => ({
  project: (c.get('project') as { id: string }).id,
  user: (c.get('user') as { id: string }).id,
});
const Target = z.object({ kind: z.string().min(1).max(40), id: z.string().min(1).max(80) });
const ReadBody = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200) }),
  z.object({ target: Target }),
]);
const FollowBody = z.object({ state: z.enum(['following', 'muted', 'none']) });

notificationRoutes.get('/notifications', read, async c => {
  const { project, user } = ids(c);
  return c.json(await feed(project, user));
});

notificationRoutes.post('/notifications/read', read, async c => {
  const input = await body(c.req, ReadBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  if ('target' in input) await markTargetRead(project, user, input.target.kind, input.target.id);
  else await markRead(project, user, 'all' in input ? 'all' : input.ids);
  return c.json(await feed(project, user));
});

notificationRoutes.get('/people', read, async c => c.json(await people(ids(c).project)));

notificationRoutes.get('/follow/:kind/:id', read, async c => {
  const { project, user } = ids(c);
  return c.json({ state: await followState(project, user, c.req.param('kind'), c.req.param('id')) });
});

notificationRoutes.put('/follow/:kind/:id', read, async c => {
  const input = await body(c.req, FollowBody);
  const target = Target.safeParse({ kind: c.req.param('kind'), id: c.req.param('id') });
  if (!input || !target.success) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  await setFollow(project, user, target.data.kind, target.data.id, input.state);
  return c.json({ state: input.state });
});
