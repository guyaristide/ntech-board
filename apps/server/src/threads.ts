import { randomBytes } from 'node:crypto';
import {
  isDeliveryKind,
  isThreadKind,
  type Attachment,
  type EntityKind,
  type ThreadComment,
  type ThreadKind,
} from '@board/shared';
import { pool } from './db';
import { createEntity, deleteEntity, getEntity, mutate, onDelete } from './repo';

/** Fils de discussion : messages rattachés à un élément ou à une pièce jointe. */

export class ThreadError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

/** Type d'élément qui décide de la visibilité : celui visé, ou celui qui porte la pièce jointe. */
export async function ownerKind(projectId: string, target: ThreadComment['target']): Promise<string> {
  if (target.kind !== 'attachment') return target.kind;
  return (await getEntity(projectId, 'attachment', target.id))?.owner.kind ?? 'attachment';
}

export const isDeliveryTarget = async (projectId: string, target: ThreadComment['target']) =>
  isDeliveryKind(await ownerKind(projectId, target));

export async function commentsOf(projectId: string, kind: string, id: string) {
  const { rows } = await pool.query<{ data: ThreadComment }>(
    `SELECT data FROM entities WHERE project_id = $1 AND kind = 'comment'
        AND data->'target'->>'kind' = $2 AND data->'target'->>'id' = $3
      ORDER BY data->>'at'`,
    [projectId, kind, id],
  );
  return rows.map(r => r.data);
}

export async function postComment(input: {
  projectId: string;
  user: { id: string; name: string; email: string };
  target: { kind: ThreadKind; id: string };
  text: string;
  replyTo?: string;
  /** Membres mentionnés (identifiants de comptes) ; ceux qui ne sont pas du projet sont ignorés. */
  mentions?: string[];
}): Promise<ThreadComment> {
  const { projectId, user, target } = input;
  if (!(await getEntity(projectId, target.kind as EntityKind, target.id)))
    throw new ThreadError('not_found', 'Élément introuvable.', 404);
  let replyTo = '';
  if (input.replyTo) {
    const parent = await getEntity(projectId, 'comment', input.replyTo);
    if (!parent || parent.target.kind !== target.kind || parent.target.id !== target.id)
      throw new ThreadError('not_found', 'Message introuvable dans ce fil.', 404);
    // Un seul niveau de réponses : répondre à une réponse, c'est répondre au même message.
    replyTo = parent.replyTo || parent.id;
    // Répondre à un fil résolu le rouvre : la question n'est plus réglée.
    const head = parent.replyTo ? await getEntity(projectId, 'comment', parent.replyTo) : parent;
    if (head?.resolvedAt)
      await mutate(projectId, 'comment', head.id, user.id, 'reopen', x => ({
        ...x,
        resolvedAt: null,
        resolvedBy: '',
      }));
  }
  return createEntity(
    projectId,
    user.id,
    'comment',
    () => `CM-${randomBytes(6).toString('hex')}`,
    id => ({
      id,
      target,
      replyTo,
      author: user.id,
      authorName: user.name || user.email,
      text: input.text,
      at: new Date().toISOString(),
      editedAt: null,
      ...(input.mentions?.length ? { mentions: [...new Set(input.mentions)] } : {}),
      deleted: false,
    }),
  );
}

export async function editComment(projectId: string, userId: string, id: string, text: string) {
  const c = await getEntity(projectId, 'comment', id);
  if (!c || c.deleted) throw new ThreadError('not_found', 'Message introuvable.', 404);
  if (c.author !== userId)
    throw new ThreadError('forbidden', 'Seul l’auteur peut modifier son message.', 403);
  return mutate(projectId, 'comment', id, userId, 'edit', x => ({
    ...x,
    text,
    editedAt: new Date().toISOString(),
  }));
}

/** Marque un fil résolu, ou le rouvre. Se fait sur le message de tête ; tout éditeur le peut. */
export async function resolveComment(
  projectId: string,
  user: { id: string; name: string; email: string },
  id: string,
  resolved: boolean,
) {
  const c = await getEntity(projectId, 'comment', id);
  if (!c || c.deleted) throw new ThreadError('not_found', 'Message introuvable.', 404);
  const head = c.replyTo || c.id;
  return mutate(projectId, 'comment', head, user.id, resolved ? 'resolve' : 'reopen', x => ({
    ...x,
    resolvedAt: resolved ? new Date().toISOString() : null,
    resolvedBy: resolved ? user.name || user.email : '',
  }));
}

/**
 * Supprime un message (son auteur, ou un administrateur). Un message qui a des réponses est vidé
 * plutôt que supprimé : les réponses gardent leur contexte.
 */
export async function removeComment(
  projectId: string,
  userId: string,
  isAdmin: boolean,
  id: string,
): Promise<ThreadComment | null> {
  const c = await getEntity(projectId, 'comment', id);
  if (!c) throw new ThreadError('not_found', 'Message introuvable.', 404);
  if (c.author !== userId && !isAdmin)
    throw new ThreadError('forbidden', 'Seul l’auteur ou un administrateur peut supprimer ce message.', 403);
  const replies = c.replyTo
    ? []
    : (await commentsOf(projectId, c.target.kind, c.target.id)).filter(x => x.replyTo === c.id && !x.deleted);
  if (replies.length)
    return mutate(projectId, 'comment', id, userId, 'delete', x => ({ ...x, text: '', deleted: true }));
  await deleteEntity(projectId, userId, 'comment', id);
  // Dernière réponse d'un message déjà vidé : il n'a plus de raison d'être.
  if (c.replyTo) {
    const parent = await getEntity(projectId, 'comment', c.replyTo);
    const left = (await commentsOf(projectId, c.target.kind, c.target.id)).some(
      x => x.replyTo === c.replyTo && !x.deleted,
    );
    if (parent?.deleted && !left) await deleteEntity(projectId, userId, 'comment', parent.id);
  }
  return null;
}

// Un élément ou une pièce jointe supprimé emporte son fil.
onDelete(async (projectId, userId, kind, id) => {
  if (!isThreadKind(kind)) return;
  for (const c of await commentsOf(projectId, kind, id))
    await deleteEntity(projectId, userId, 'comment', c.id);
});

/** Messages visibles d'un membre qui ne voit pas la partie Réalisation. */
export const withoutDelivery = (comments: ThreadComment[], attachments: Attachment[]) =>
  comments.filter(c => {
    const kind =
      c.target.kind === 'attachment'
        ? attachments.find(a => a.id === c.target.id)?.owner.kind
        : c.target.kind;
    return kind !== undefined && !isDeliveryKind(kind);
  });
