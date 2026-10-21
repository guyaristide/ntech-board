import { Hono } from 'hono';
import { replannable, sprintPeriods, sprintsOf, type Release, type Sprint } from '@board/shared';
import { requireDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { fail } from '../log';
import { createMany, getEntity, getSettings, mutateMany, nextId, NotFound } from '../repo';
import { all } from './delivery';
import { SprintPlan, SprintReplan } from './deliverySchemas';
import { body } from './workspace';

/** Sprints d'une version en série : création d'un coup, puis mise à jour d'un coup. */
export const sprintPlanRoutes = new Hono<AppEnv>();

const write = [requireRole('editor'), requireDelivery] as const;

sprintPlanRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

const projectOf = (c: { get: (k: 'project') => unknown }) => (c.get('project') as { id: string }).id;
const userOf = (c: { get: (k: 'user') => unknown }) => (c.get('user') as { id: string }).id;

/** Crée les sprints d'une version, enchaînés à partir d'une date : jusqu'à une date, ou en nombre. */
sprintPlanRoutes.post('/releases/:id/sprints', ...write, async c => {
  const input = await body(c.req, SprintPlan);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const project = projectOf(c);
  const release = await getEntity(project, 'release', c.req.param('id'));
  if (!release) return c.json({ error: 'not_found' }, 404);
  const periods = sprintPeriods(input.start, input.weeks, { until: input.until, count: input.count });
  if (!periods.length) return c.json({ error: 'empty', message: 'Aucun sprint dans cette période.' }, 400);
  const created = await createMany(
    project,
    userOf(c),
    'sprint',
    ids => nextId(ids, 'SP-'),
    periods.map(p => (id: string): Sprint => ({
      id,
      name: `Sprint ${Number(id.slice(3))}`,
      goal: '',
      ...p,
      status: 'planned',
      capacity: input.capacity,
      release: (release as Release).id,
      review: [],
      retro: [],
      closedAt: null,
      velocity: null,
      carried: [],
    })),
  );
  return c.json(created, 201);
});

/**
 * Met à jour d'un coup les sprints d'une version. Dates : seuls les sprints pas encore commencés
 * sont réenchaînés, dans leur ordre actuel. Capacité : sprints prévus et en cours.
 */
sprintPlanRoutes.patch('/releases/:id/sprints', ...write, async c => {
  const input = await body(c.req, SprintReplan);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const project = projectOf(c);
  const id = c.req.param('id');
  if (!(await getEntity(project, 'release', id))) return c.json({ error: 'not_found' }, 404);
  const sprints = await all<Sprint>(project, 'sprint');
  const planned = replannable(id, sprints);
  const dates = new Map<string, { start: string; end: string }>();
  if ((input.start || input.weeks) && planned.length) {
    const weeks = input.weeks ?? (await getSettings(project)).delivery.sprintWeeks;
    const start = input.start ?? planned[0].start;
    if (!start) return c.json({ error: 'start_required', message: 'Indiquez la date de début.' }, 400);
    sprintPeriods(start, weeks, { count: planned.length }).forEach((p, i) => dates.set(planned[i].id, p));
  }
  const capacity = input.capacity !== undefined;
  const ids = sprintsOf(id, sprints)
    .filter(s => dates.has(s.id) || (capacity && s.status !== 'closed'))
    .map(s => s.id);
  const updated = await mutateMany(project, 'sprint', ids, userOf(c), 'update', s => ({
    ...s,
    ...dates.get(s.id),
    ...(capacity && s.status !== 'closed' ? { capacity: input.capacity ?? null } : {}),
  }));
  return c.json(updated);
});
