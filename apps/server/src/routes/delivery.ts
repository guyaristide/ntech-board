import { Hono } from 'hono';
import {
  isDone,
  load,
  nextSprintDates,
  TICKET_LINK_INVERSE,
  withTicketDefaults,
  type ProjectSettings,
  type Release,
  type Sprint,
  type Story,
  type Ticket,
} from '@board/shared';
import { requireDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { pool } from '../db';
import { fail } from '../log';
import {
  createEntity,
  createMany,
  deleteEntity,
  getEntity,
  getSettings,
  mutate,
  mutateMany,
  mutatePair,
  nextId,
  NotFound,
} from '../repo';
import {
  ReleaseCreate,
  ReleasePatch,
  SprintClose,
  SprintCreate,
  SprintPatch,
  TicketCreate,
  TicketLinkBody,
  TicketPatch,
} from './deliverySchemas';
import { CommentBody } from './schemas';
import { body, comment } from './workspace';

/** Partie Réalisation : versions, sprints et tickets. Réservée aux membres qui la voient. */
export const deliveryRoutes = new Hono<AppEnv>();

const write = [requireRole('editor'), requireDelivery] as const;

deliveryRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

type Ctx = { get: (k: 'project' | 'user') => unknown };
const who = (c: Ctx) => ({
  project: (c.get('project') as { id: string; slug: string }).id,
  slug: (c.get('project') as { slug: string }).slug,
  user: (c.get('user') as { id: string; name: string; email: string }),
});

export async function all<T>(projectId: string, kind: string): Promise<T[]> {
  const { rows } = await pool.query<{ data: T }>(
    'SELECT data FROM entities WHERE project_id = $1 AND kind = $2 ORDER BY position',
    [projectId, kind],
  );
  return rows.map(r => r.data);
}

/** Préfixe des clés de tickets : celui des réglages, sinon tiré de l'identifiant du projet. */
export const keyOf = (settings: ProjectSettings, slug: string) =>
  settings.delivery.key || slug.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() || 'T';

const now = () => new Date().toISOString();

// --- Versions ---------------------------------------------------------------------------

deliveryRoutes.post('/releases', ...write, async c => {
  const input = await body(c.req, ReleaseCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const release = await createEntity(
    project,
    user.id,
    'release',
    ids => nextId(ids, 'REL-'),
    (id): Release => ({
      id,
      name: `Version ${Number(id.slice(4))}`,
      goal: '',
      start: null,
      end: null,
      status: 'Prévue',
      versions: [],
      notes: [],
      ...input.patch,
    }),
  );
  return c.json(release, 201);
});

deliveryRoutes.patch('/releases/:id', ...write, async c => {
  const patch = await body(c.req, ReleasePatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(await mutate(project, 'release', c.req.param('id'), user.id, 'update', r => ({ ...r, ...patch }), patch));
});

/** Supprime une version ; les sprints et tickets qui y étaient rattachés n'ont plus de version. */
deliveryRoutes.delete('/releases/:id', ...write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  await deleteEntity(project, user.id, 'release', id);
  const tickets = (await all<Ticket>(project, 'ticket')).filter(t => t.release === id).map(t => t.id);
  const sprints = (await all<Sprint>(project, 'sprint')).filter(s => s.release === id).map(s => s.id);
  await mutateMany(project, 'ticket', tickets, user.id, 'update', t => ({ ...t, release: '' }), { release: '' });
  await mutateMany(project, 'sprint', sprints, user.id, 'update', s => ({ ...s, release: '' }), { release: '' });
  return c.json({ ok: true });
});

// --- Sprints ----------------------------------------------------------------------------

deliveryRoutes.post('/sprints', ...write, async c => {
  const input = await body(c.req, SprintCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const settings = await getSettings(project);
  const dates = nextSprintDates(await all<Sprint>(project, 'sprint'), settings.delivery.sprintWeeks);
  const sprint = await createEntity(
    project,
    user.id,
    'sprint',
    ids => nextId(ids, 'SP-'),
    (id): Sprint => ({
      id,
      name: `Sprint ${Number(id.slice(3))}`,
      goal: '',
      ...dates,
      status: 'planned',
      capacity: null,
      release: '',
      review: [],
      retro: [],
      closedAt: null,
      velocity: null,
      carried: [],
      ...input.patch,
    }),
  );
  return c.json(sprint, 201);
});

deliveryRoutes.patch('/sprints/:id', ...write, async c => {
  const patch = await body(c.req, SprintPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(await mutate(project, 'sprint', c.req.param('id'), user.id, 'update', s => ({ ...s, ...patch }), patch));
});

/** Supprime un sprint ; ses tickets retournent au backlog. */
deliveryRoutes.delete('/sprints/:id', ...write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  const tickets = (await all<Ticket>(project, 'ticket')).filter(t => t.sprint === id).map(t => t.id);
  await mutateMany(project, 'ticket', tickets, user.id, 'update', t => ({ ...t, sprint: '' }), { sprint: '' });
  await deleteEntity(project, user.id, 'sprint', id);
  return c.json({ ok: true });
});

/** Démarre un sprint : un seul sprint en cours à la fois. */
deliveryRoutes.post('/sprints/:id/start', ...write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  const active = (await all<Sprint>(project, 'sprint')).find(s => s.status === 'active' && s.id !== id);
  if (active) return c.json({ error: 'sprint_active', message: `${active.name} est déjà en cours : clôturez-le d’abord.` }, 409);
  return c.json(await mutate(project, 'sprint', id, user.id, 'start', s => ({ ...s, status: 'active' })));
});

/**
 * Clôture : note l'estimation terminée (vélocité), envoie les tickets non terminés au backlog ou
 * dans le sprint choisi, et garde la liste des tickets reportés.
 */
deliveryRoutes.post('/sprints/:id/close', ...write, async c => {
  const input = await body(c.req, SprintClose);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const id = c.req.param('id');
  if (input.moveTo === id) return c.json({ error: 'invalid' }, 400);
  if (input.moveTo && !(await getEntity(project, 'sprint', input.moveTo))) return c.json({ error: 'not_found' }, 404);
  const settings = await getSettings(project);
  const tickets = (await all<Ticket>(project, 'ticket')).filter(t => t.sprint === id);
  const open = tickets.filter(t => !isDone(settings, t)).map(t => t.id);
  await mutateMany(project, 'ticket', open, user.id, 'carry', t => ({ ...t, sprint: input.moveTo, updatedAt: now() }), {
    sprint: input.moveTo,
  });
  const velocity = load(tickets.filter(t => isDone(settings, t))).total;
  return c.json(
    await mutate(project, 'sprint', id, user.id, 'close', s => ({
      ...s,
      status: 'closed',
      closedAt: now(),
      velocity,
      carried: open,
    })),
  );
});

// --- Tickets ----------------------------------------------------------------------------

/** Ticket vierge : premier type et première étape des réglages, au backlog. */
export const blankTicket = (settings: ProjectSettings, id: string, rank: number): Ticket => ({
  id,
  type: settings.delivery.ticketTypes[0].id,
  title: '',
  story: '',
  parent: '',
  status: settings.delivery.workflow[0].id,
  estimate: null,
  release: '',
  sprint: '',
  rank,
  ready: [],
  assignee: '',
  links: [],
  description: [],
  comments: [],
  createdAt: now(),
  updatedAt: now(),
});

/** Ticket « US » : type story s'il existe, sinon le premier type des réglages. */
const storyType = (settings: ProjectSettings) =>
  settings.delivery.ticketTypes.find(t => t.id === 'story')?.id ?? settings.delivery.ticketTypes[0].id;

deliveryRoutes.post('/tickets', ...write, async c => {
  const input = await body(c.req, TicketCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, slug, user } = who(c);
  const settings = await getSettings(project);
  const existing = await all<Ticket>(project, 'ticket');
  let rank = existing.reduce((m, t) => Math.max(m, t.rank), 0);
  const base = (id: string) => blankTicket(settings, id, ++rank);
  const pick = (ids: string[]) => nextId(ids, `${keyOf(settings, slug)}-`, 1);
  if (!('stories' in input)) {
    // Sous-tâche : même sprint et même version que son ticket parent, sauf indication contraire.
    const parent = input.patch.parent ? existing.find(t => t.id === input.patch.parent) : undefined;
    if (input.patch.parent && !parent) return c.json({ error: 'not_found' }, 404);
    const inherited = parent ? { sprint: parent.sprint, release: parent.release } : {};
    const ticket = await createEntity(project, user.id, 'ticket', pick, id => ({
      ...base(id),
      ...inherited,
      ...input.patch,
    }));
    return c.json([ticket], 201);
  }
  // Une US déjà en réalisation n'est pas reprise une seconde fois.
  const taken = new Set(existing.map(t => t.story).filter(Boolean));
  const stories = (await all<Story>(project, 'story')).filter(s => input.stories.includes(s.id) && !taken.has(s.id));
  const releases = await all<Release>(project, 'release');
  const releaseOf = (s: Story) => releases.find(r => r.versions.includes(s.version) && r.status !== 'Abandonnée')?.id ?? '';
  const created = await createMany(
    project,
    user.id,
    'ticket',
    pick,
    stories.map(s => (id: string) => ({
      ...base(id),
      type: storyType(settings),
      title: s.title,
      story: s.id,
      release: releaseOf(s),
      ...input.patch,
    })),
  );
  return c.json(created, 201);
});

deliveryRoutes.patch('/tickets/:id', ...write, async c => {
  const patch = await body(c.req, TicketPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const settings = await getSettings(project);
  if (patch.status && !settings.delivery.workflow.some(s => s.id === patch.status))
    return c.json({ error: 'invalid', message: 'Étape inconnue.' }, 400);
  if (patch.sprint && !(await getEntity(project, 'sprint', patch.sprint))) return c.json({ error: 'not_found' }, 404);
  if (patch.parent === c.req.param('id')) return c.json({ error: 'invalid' }, 400);
  if (patch.parent && !(await getEntity(project, 'ticket', patch.parent))) return c.json({ error: 'not_found' }, 404);
  return c.json(
    await mutate(project, 'ticket', c.req.param('id'), user.id, 'update', t => ({ ...t, ...patch, updatedAt: now() }), patch),
  );
});

/** Supprime un ticket ; ses liaisons disparaissent des autres tickets, ses sous-tâches n'ont plus de parent. */
deliveryRoutes.delete('/tickets/:id', ...write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  await deleteEntity(project, user.id, 'ticket', id);
  const others = (await all<Ticket>(project, 'ticket')).map(withTicketDefaults);
  const linked = others.filter(t => t.links.some(l => l.ticket === id)).map(t => t.id);
  const children = others.filter(t => t.parent === id).map(t => t.id);
  await mutateMany(project, 'ticket', linked, user.id, 'unlink', t => ({
    ...t,
    links: (t.links ?? []).filter(l => l.ticket !== id),
  }));
  await mutateMany(project, 'ticket', children, user.id, 'update', t => ({ ...t, parent: '' }), { parent: '' });
  return c.json({ ok: true });
});

/** Liaison entre deux tickets, posée des deux côtés dans une transaction (une seule par couple). */
deliveryRoutes.post('/tickets/:id/links', ...write, async c => {
  const input = await body(c.req, TicketLinkBody);
  const id = c.req.param('id');
  if (!input || input.ticket === id) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const put = (t: Ticket, link: Ticket['links'][number]) => ({
    ...t,
    links: [...(t.links ?? []).filter(l => l.ticket !== link.ticket), link],
  });
  const [ticket] = await mutatePair(
    project,
    'ticket',
    [id, input.ticket],
    user.id,
    'link',
    (a, b) => [put(a, input), put(b, { ticket: id, type: TICKET_LINK_INVERSE[input.type] })],
    input,
  );
  return c.json(ticket);
});

deliveryRoutes.delete('/tickets/:id/links/:other', ...write, async c => {
  const { project, user } = who(c);
  const [id, other] = [c.req.param('id'), c.req.param('other')];
  const drop = (t: Ticket, x: string) => ({ ...t, links: (t.links ?? []).filter(l => l.ticket !== x) });
  const [ticket] = await mutatePair(project, 'ticket', [id, other], user.id, 'unlink', (a, b) => [drop(a, other), drop(b, id)], {
    ticket: other,
  });
  return c.json(ticket);
});

deliveryRoutes.post('/tickets/:id/comments', ...write, async c => {
  const input = await body(c.req, CommentBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(
    await mutate(project, 'ticket', c.req.param('id'), user.id, 'comment', t => ({
      ...t,
      comments: [...t.comments, comment(user, input.text)],
    })),
  );
});
