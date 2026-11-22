import { Hono } from 'hono';
import { z } from 'zod';
import { MAX_COMMENT_LENGTH, THREAD_KINDS, type ThreadKind } from '@board/shared';
import { seesDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { fail } from '../log';
import { getEntity } from '../repo';
import {
  commentsOf,
  editComment,
  isDeliveryTarget,
  postComment,
  removeComment,
  ThreadError,
} from '../threads';
import { body } from './workspace';

/** Fils de discussion : lire, écrire, modifier et supprimer des messages. */
export const threadRoutes = new Hono<AppEnv>();

threadRoutes.onError((err, c) => {
  if (err instanceof ThreadError) return c.json({ error: err.code, message: err.message }, err.status);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

const text = z.string().trim().min(1).max(MAX_COMMENT_LENGTH);
const target = z.object({
  kind: z.enum(THREAD_KINDS as unknown as [ThreadKind, ...ThreadKind[]]),
  id: z.string().min(1).max(80),
});
const NewComment = z.object({ target, text, replyTo: z.string().max(40).optional() });
const EditComment = z.object({ text });

type Ctx = { get: (k: 'project' | 'user' | 'role') => unknown };
const who = (c: Ctx) => ({
  project: c.get('project') as { id: string },
  user: c.get('user') as { id: string; name: string; email: string },
  role: c.get('role') as 'viewer' | 'editor' | 'admin',
});

/** Un fil de la partie Réalisation n'est lisible et modifiable que par ceux qui la voient. */
async function allowed(c: Ctx, t: { kind: ThreadKind; id: string }) {
  const { project, user, role } = who(c);
  return !(await isDeliveryTarget(project.id, t)) || seesDelivery(project.id, role, user.id);
}

threadRoutes.get('/threads/:kind/:id', requireRole('viewer'), async c => {
  const t = target.safeParse({ kind: c.req.param('kind'), id: c.req.param('id') });
  if (!t.success) return c.json({ error: 'invalid' }, 400);
  if (!(await allowed(c, t.data))) return c.json({ error: 'delivery_hidden' }, 403);
  return c.json(await commentsOf(who(c).project.id, t.data.kind, t.data.id));
});

threadRoutes.post('/comments', requireRole('editor'), async c => {
  const input = await body(c.req, NewComment);
  if (!input) return c.json({ error: 'invalid' }, 400);
  if (!(await allowed(c, input.target))) return c.json({ error: 'delivery_hidden' }, 403);
  const { project, user } = who(c);
  return c.json(await postComment({ projectId: project.id, user, ...input }), 201);
});

threadRoutes.patch('/comments/:id', requireRole('editor'), async c => {
  const input = await body(c.req, EditComment);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const existing = await getEntity(project.id, 'comment', c.req.param('id'));
  if (existing && !(await allowed(c, existing.target))) return c.json({ error: 'delivery_hidden' }, 403);
  return c.json(await editComment(project.id, user.id, c.req.param('id'), input.text));
});

threadRoutes.delete('/comments/:id', requireRole('editor'), async c => {
  const { project, user, role } = who(c);
  const existing = await getEntity(project.id, 'comment', c.req.param('id'));
  if (existing && !(await allowed(c, existing.target))) return c.json({ error: 'delivery_hidden' }, 403);
  // Vidé (il a des réponses) : le message mis à jour ; supprimé : null.
  return c.json({ kept: await removeComment(project.id, user.id, role === 'admin', c.req.param('id')) });
});
