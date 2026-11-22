import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  MAX_COMMENT_LENGTH,
  THREAD_KINDS,
  threadOf,
  type ThreadComment,
  type ThreadKind,
  type WorkspaceData,
} from '@board/shared';
import { tool, type Ctx } from './context';

/** Cibles de l'outil « commenter » (antérieur aux fils, noms en français), vers les types d'éléments. */
const COMMENT_TARGET = {
  us: 'story',
  ticket: 'ticket',
  risque: 'risk',
  diligence: 'diligence',
  atelier: 'workshop',
  phase: 'phase',
} as const;

/** Fils de discussion par le MCP : lire le fil d'un élément ou d'un fichier, y écrire, y répondre. */

const kind = z
  .enum(THREAD_KINDS as unknown as [ThreadKind, ...ThreadKind[]])
  .describe(
    'Type d’élément : story (US), epic, workshop, reference, phase, risk, diligence, party, release, sprint, ticket, campaign, attachment (pièce jointe)',
  );

const line = (c: ThreadComment, indent = '') =>
  `${indent}- [${c.id}] ${c.authorName || 'Anonyme'}, ${c.at.slice(0, 16).replace('T', ' ')}${c.editedAt && !c.deleted ? ' (modifié)' : ''}${c.resolvedAt ? ' (fil résolu)' : ''} : ${c.deleted ? '(message supprimé)' : c.text}`;

/** Fil d'un élément en texte, réponses en retrait ; vide s'il n'y a aucun message. */
export function threadText(ws: WorkspaceData, k: string, id: string) {
  return threadOf(ws.comments ?? [], k, id)
    .map(e => [line(e.comment), ...e.replies.map(r => line(r, '  '))].join('\n'))
    .join('\n');
}

export function registerThreads(server: McpServer, ctx: Ctx, canWrite: boolean) {
  tool(
    server,
    'read_thread',
    {
      title: 'Lire un fil de discussion',
      description:
        'Messages du fil de discussion d’un élément (US, ticket, risque, sprint, version…) ou d’une pièce jointe, du plus ancien au plus récent, avec leurs réponses. Chaque message a un identifiant [CM-…] pour y répondre.',
      input: { kind, id: z.string().describe('Identifiant de l’élément ou de la pièce jointe (PJ-…)') },
    },
    async a => {
      const ws = await ctx.workspace();
      return threadText(ws, a.kind, a.id) || `Aucun message sur ${a.kind} ${a.id}.`;
    },
  );

  if (!canWrite) return;
  tool(
    server,
    'commenter',
    {
      title: 'Commenter',
      description:
        'Ajoute un message, signé de votre nom, au fil d’une US, d’un ticket, d’un risque, d’une diligence, d’un atelier ou d’une phase. Pour les autres éléments, les pièces jointes ou une réponse : post_comment.',
      input: {
        cible: z.enum(['us', 'ticket', 'risque', 'diligence', 'atelier', 'phase']),
        id: z.string(),
        texte: z.string().min(1).max(5000),
      },
      write: true,
    },
    async a => {
      await ctx.api('POST', '/comments', {
        target: { kind: COMMENT_TARGET[a.cible], id: a.id },
        text: a.texte,
      });
      return `Commentaire ajouté sur ${a.cible} ${a.id}.`;
    },
  );

  tool(
    server,
    'resolve_thread',
    {
      title: 'Résoudre ou rouvrir un fil',
      description:
        'Marque un fil de discussion résolu (la question est réglée) ou le rouvre. Indiquez un message du fil : c’est le fil entier, message de tête et réponses, qui change d’état.',
      input: {
        comment_id: z.string().describe('Identifiant d’un message du fil (CM-…)'),
        resolved: z.boolean().default(true),
      },
      write: true,
    },
    async a => {
      const c = await ctx.api<ThreadComment>('PATCH', `/comments/${encodeURIComponent(a.comment_id)}`, {
        resolved: a.resolved,
      });
      return `Fil ${c.id} ${c.resolvedAt ? 'résolu' : 'rouvert'}.`;
    },
  );

  tool(
    server,
    'post_comment',
    {
      title: 'Écrire dans un fil de discussion',
      description:
        'Ajoute un message, signé de votre nom, au fil d’un élément ou d’une pièce jointe ; avec reply_to, répond à un message du fil. Écrire « @Prénom Nom » d’un membre du projet le mentionne : il est prévenu.',
      input: {
        kind,
        id: z.string(),
        text: z.string().min(1).max(MAX_COMMENT_LENGTH),
        reply_to: z.string().optional().describe('Identifiant du message auquel répondre (CM-…)'),
      },
      write: true,
    },
    async a => {
      const c = await ctx.api<ThreadComment>('POST', '/comments', {
        target: { kind: a.kind, id: a.id },
        text: a.text,
        ...(a.reply_to ? { replyTo: a.reply_to } : {}),
      });
      return `Message ${c.id} ajouté${c.replyTo ? ` en réponse à ${c.replyTo}` : ''} sur ${a.kind} ${a.id}.`;
    },
  );
}
