import { isDeliveryKind } from './delivery';
import { ATTACHABLE_KINDS, type Attachment } from './files';

/**
 * Fils de discussion : des messages rattachés à n'importe quel élément du tableau (US, ticket,
 * risque, sprint, version…) ou à une pièce jointe. Un message peut répondre à un autre (un niveau).
 */

/** Éléments qui peuvent porter un fil : ceux qui reçoivent des pièces jointes, et les fichiers eux-mêmes. */
export const THREAD_KINDS = [...ATTACHABLE_KINDS, 'attachment'] as const;
export type ThreadKind = (typeof THREAD_KINDS)[number];
export const isThreadKind = (kind: string): kind is ThreadKind =>
  (THREAD_KINDS as readonly string[]).includes(kind);

export const MAX_COMMENT_LENGTH = 5000;

export interface ThreadComment {
  id: string;
  target: { kind: ThreadKind; id: string };
  /** Message auquel celui-ci répond, ou vide : message du fil. */
  replyTo: string;
  /** Utilisateur auteur (vide pour un commentaire repris de l'ancien système). */
  author: string;
  authorName: string;
  text: string;
  at: string;
  editedAt: string | null;
  /** Membres mentionnés (@Nom) : ils sont prévenus. Absent des messages antérieurs aux mentions. */
  mentions?: string[];
  /** Supprimé alors qu'il avait des réponses : gardé pour ne pas les orpheliner, sans texte. */
  deleted: boolean;
}

/** Message du fil avec ses réponses, du plus ancien au plus récent. */
export interface ThreadEntry {
  comment: ThreadComment;
  replies: ThreadComment[];
}

const byDate = (a: ThreadComment, b: ThreadComment) => a.at.localeCompare(b.at);
const on = (c: ThreadComment, kind: string, id: string) => c.target.kind === kind && c.target.id === id;

/**
 * Fil d'un élément. Un message supprimé n'apparaît que s'il a encore des réponses ; une réponse dont
 * le message a disparu remonte dans le fil.
 */
export function threadOf(comments: ThreadComment[], kind: string, id: string): ThreadEntry[] {
  const mine = comments.filter(c => on(c, kind, id)).sort(byDate);
  const tops = new Set(mine.filter(c => !c.replyTo).map(c => c.id));
  const replies = (parent: string) => mine.filter(c => c.replyTo === parent && !c.deleted);
  return mine
    .filter(c => !c.replyTo || !tops.has(c.replyTo))
    .map(c => ({ comment: c, replies: c.replyTo ? [] : replies(c.id) }))
    .filter(e => !e.comment.deleted || e.replies.length);
}

/** Nombre de messages visibles d'un élément (réponses comprises). */
export const commentCount = (comments: ThreadComment[], kind: string, id: string) =>
  comments.filter(c => on(c, kind, id) && !c.deleted).length;

/**
 * Type d'élément qui décide de la visibilité d'un message : celui qu'il vise, ou, pour une pièce
 * jointe, l'élément qui la porte (un fichier d'un ticket suit la partie Réalisation).
 */
export function visibilityKind(c: Pick<ThreadComment, 'target'>, attachments: Attachment[]): string {
  if (c.target.kind !== 'attachment') return c.target.kind;
  return attachments.find(a => a.id === c.target.id)?.owner.kind ?? 'attachment';
}

/** Message réservé à la partie Réalisation (masqué à qui ne la voit pas). */
export const isDeliveryComment = (c: Pick<ThreadComment, 'target'>, attachments: Attachment[]) =>
  isDeliveryKind(visibilityKind(c, attachments));
