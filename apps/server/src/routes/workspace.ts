import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { z } from 'zod';
import {
  ENTITY_KINDS,
  isDeliveryKind,
  LINK_INVERSE,
  putLink,
  withStoryDefaults,
  type Comment,
  type EntityKind,
  type ServerEvent,
  type Story,
  type Workshop,
} from '@board/shared';
import { seesDelivery } from '../access';
import { requireRole, type AppEnv, type User } from '../auth';
import {
  createStory,
  deleteEntity,
  getEntity,
  getWorkspace,
  history,
  mutate,
  mutatePair,
  NotFound,
} from '../repo';
import { setPresence, subscribe } from '../realtime';
import { fail, log } from '../log';
import { uid } from '../merge';
import {
  CommentBody,
  CreateStory,
  PresenceBody,
  QuestionCreate,
  QuestionPatch,
  StoryLinkBody,
  StoryPatch,
} from './schemas';

export const workspaceRoutes = new Hono<AppEnv>();

const read = requireRole('viewer');
const write = requireRole('editor');

/** Corps JSON validé, ou null (la route répond alors 400). */
export async function body<S extends z.ZodType>(
  req: { json: () => Promise<unknown> },
  schema: S,
): Promise<z.infer<S> | null> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

export const comment = (user: User, text: string): Comment => ({
  id: uid(),
  author: user.name || user.email,
  at: new Date().toISOString(),
  text,
});

workspaceRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

workspaceRoutes.get('/workspace', read, async c => {
  const p = c.get('project');
  const data = await getWorkspace(p.id, p.planning);
  // La partie Réalisation n'est envoyée qu'à ceux qui la voient (réglages du projet).
  if (!(await seesDelivery(p.id, c.get('role'), c.get('user')!.id)))
    Object.assign(data, { releases: [], sprints: [], tickets: [], campaigns: [] });
  return c.json(data);
});

// --- US ---------------------------------------------------------------------------------

workspaceRoutes.patch('/stories/:id', write, async c => {
  const patch = await body(c.req, StoryPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const story = await mutate(
    c.get('project').id,
    'story',
    c.req.param('id'),
    c.get('user')!.id,
    'update',
    s => ({
      ...s,
      ...patch,
      updatedAt: new Date().toISOString(),
    }),
    patch,
  );
  return c.json(story);
});

workspaceRoutes.post('/stories', write, async c => {
  const input = await body(c.req, CreateStory);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const at = new Date().toISOString();
  const epic = await getEntity(c.get('project').id, 'epic', input.epic);
  if (!epic) return c.json({ error: 'unknown_epic' }, 400);
  const version = (['MVP', 'V1', 'V2'] as const).find(v => v === epic.version) ?? 'MVP';
  const story = await createStory(c.get('project').id, c.get('user')!.id, id => ({
    id,
    epic: input.epic,
    title: '',
    description: '',
    targets: [],
    links: [],
    actor: 'Touriste',
    asA: '',
    iWant: '',
    soThat: '',
    acceptance: [],
    scenario: 'nominal',
    source: '',
    version,
    workshop: epic.workshops[0] ?? '',
    priority: 'Should',
    derived: true,
    status: 'À cadrer',
    body: [],
    comments: [],
    createdAt: at,
    updatedAt: at,
    ...input.patch,
  }));
  return c.json(story, 201);
});

workspaceRoutes.post('/stories/:id/duplicate', write, async c => {
  const p = c.get('project');
  const src = await getEntity(p.id, 'story', c.req.param('id'));
  if (!src) return c.json({ error: 'not_found' }, 404);
  const at = new Date().toISOString();
  const story = await createStory(p.id, c.get('user')!.id, id => ({
    ...withStoryDefaults(src),
    id,
    title: `${src.title} (copie)`,
    // La copie est une autre US : elle ne reprend pas les liaisons de l'originale.
    links: [],
    acceptance: src.acceptance.map(a => ({ ...a, id: uid(), done: false })),
    body: src.body.map(b => ({ ...b, id: uid() })),
    comments: [],
    status: 'À cadrer',
    derived: true,
    createdAt: at,
    updatedAt: at,
  }));
  return c.json(story, 201);
});

workspaceRoutes.delete('/stories/:id', write, async c => {
  const p = c.get('project').id;
  const user = c.get('user')!.id;
  const id = c.req.param('id');
  const story = await getEntity(p, 'story', id);
  await deleteEntity(p, user, 'story', id);
  // Les US liées ne gardent pas de liaison vers une US qui n'existe plus.
  for (const l of story?.links ?? [])
    await mutate(p, 'story', l.story, user, 'unlink', s => ({
      ...s,
      links: (s.links ?? []).filter(x => x.story !== id),
    })).catch(e => {
      if (!(e instanceof NotFound)) throw e;
    });
  return c.json({ ok: true });
});

/** Lie deux US ; la liaison inverse (« dépend de » / « nécessaire à ») est posée sur l'autre. */
workspaceRoutes.post('/stories/:id/links', write, async c => {
  const input = await body(c.req, StoryLinkBody);
  const id = c.req.param('id');
  if (!input || input.story === id) return c.json({ error: 'invalid' }, 400);
  const [story] = await mutatePair(
    c.get('project').id,
    'story',
    [id, input.story],
    c.get('user')!.id,
    'link',
    (a, b) => [
      { ...a, links: putLink(a.links ?? [], input) },
      { ...b, links: putLink(b.links ?? [], { story: id, type: LINK_INVERSE[input.type] }) },
    ],
    input,
  );
  return c.json(story);
});

workspaceRoutes.delete('/stories/:id/links/:other', write, async c => {
  const { id, other } = c.req.param();
  const [story] = await mutatePair(
    c.get('project').id,
    'story',
    [id, other],
    c.get('user')!.id,
    'unlink',
    (a, b) => [
      { ...a, links: (a.links ?? []).filter(l => l.story !== other) },
      { ...b, links: (b.links ?? []).filter(l => l.story !== id) },
    ],
    { story: other },
  );
  return c.json(story);
});

workspaceRoutes.post('/stories/:id/comments', write, async c => {
  const input = await body(c.req, CommentBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const user = c.get('user')!;
  const story = await mutate(
    c.get('project').id,
    'story',
    c.req.param('id'),
    user.id,
    'comment',
    (s: Story) => ({
      ...s,
      comments: [...s.comments, comment(user, input.text)],
    }),
  );
  return c.json(story);
});

workspaceRoutes.get('/history/:kind/:id', read, async c => {
  const kind = c.req.param('kind');
  if (!ENTITY_KINDS.includes(kind as EntityKind)) return c.json({ error: 'invalid' }, 400);
  if (isDeliveryKind(kind) && !(await seesDelivery(c.get('project').id, c.get('role'), c.get('user')!.id)))
    return c.json({ error: 'delivery_hidden' }, 403);
  return c.json(await history(c.get('project').id, kind as EntityKind, c.req.param('id')));
});

// --- Épiques ----------------------------------------------------------------------------

// --- Ateliers ---------------------------------------------------------------------------

const onWorkshop = (
  c: { get: (k: 'project' | 'user') => unknown },
  id: string,
  action: string,
  change: (w: Workshop) => Workshop,
  patch?: unknown,
) =>
  mutate(
    (c.get('project') as { id: string }).id,
    'workshop',
    id,
    (c.get('user') as User).id,
    action,
    change,
    patch,
  );

const onSession = (
  w: Workshop,
  code: string,
  change: (s: Workshop['sessions'][number]) => Workshop['sessions'][number],
) => {
  if (!w.sessions.some(s => s.code === code)) throw new NotFound(`session ${code}`);
  return { ...w, sessions: w.sessions.map(s => (s.code === code ? change(s) : s)) };
};

workspaceRoutes.patch('/workshops/:id/sessions/:code/questions/:qid', write, async c => {
  const patch = await body(c.req, QuestionPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { code, qid } = c.req.param();
  return c.json(
    await onWorkshop(
      c,
      c.req.param('id'),
      `question:${code}`,
      w =>
        onSession(w, code, s => {
          if (!s.questions.some(q => q.id === qid)) throw new NotFound(`question ${qid}`);
          return { ...s, questions: s.questions.map(q => (q.id === qid ? { ...q, ...patch } : q)) };
        }),
      patch,
    ),
  );
});

workspaceRoutes.post('/workshops/:id/sessions/:code/questions', write, async c => {
  const input = await body(c.req, QuestionCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const code = c.req.param('code');
  return c.json(
    await onWorkshop(c, c.req.param('id'), `question-add:${code}`, w =>
      onSession(w, code, s => ({
        ...s,
        questions: [
          ...s.questions,
          { id: uid(), text: input.text, answer: '', status: 'Ouvert', custom: true },
        ],
      })),
    ),
  );
});

workspaceRoutes.post('/workshops/:id/comments', write, async c => {
  const input = await body(c.req, CommentBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const user = c.get('user')!;
  return c.json(
    await onWorkshop(c, c.req.param('id'), 'comment', w => ({
      ...w,
      comments: [...w.comments, comment(user, input.text)],
    })),
  );
});

// --- Temps réel -------------------------------------------------------------------------

workspaceRoutes.get('/events', read, c => {
  const user = c.get('user')!;
  const projectId = c.get('project').id;
  const key = c.req.query('client') || randomUUID();
  return streamSSE(c, async stream => {
    const queue: ServerEvent[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = subscribe({
      id: randomUUID(),
      key,
      projectId,
      user: { id: user.id, name: user.name, email: user.email },
      role: c.get('role')!,
      send: event => {
        queue.push(event);
        wake?.();
      },
    });
    log('temps-réel', `ouvert · ${c.get('project').slug} · ${user.email}`);
    stream.onAbort(() => {
      log('temps-réel', `fermé · ${c.get('project').slug} · ${user.email}`);
      unsubscribe();
    });
    await stream.writeSSE({ event: 'ready', data: key });
    // Battement toutes les 25 s : les proxys (Traefik) ne coupent pas une connexion silencieuse.
    while (!stream.aborted) {
      // On n'attend que si rien n'est en file (l'état de présence initial y est déjà).
      if (!queue.length)
        await new Promise<void>(resolve => {
          wake = resolve;
          setTimeout(resolve, 25_000);
        });
      wake = null;
      if (!queue.length) await stream.writeSSE({ event: 'ping', data: '' });
      while (queue.length) await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
    }
    unsubscribe();
  });
});

workspaceRoutes.post('/presence', read, async c => {
  const input = await body(c.req, PresenceBody);
  const key = c.req.query('client');
  if (!input || !key) return c.json({ error: 'invalid' }, 400);
  const user = c.get('user')!;
  setPresence(key, c.get('project').id, { id: user.id, name: user.name, email: user.email }, input.path);
  return c.json({ ok: true });
});
