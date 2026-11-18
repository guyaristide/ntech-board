import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CONFIDENCE_LABEL, type Proposal, type SourceItem } from '@board/shared';
import { tool, type Ctx } from './context';

/**
 * Sources externes par le MCP : un assistant connecté à Slack, à un outil de réunion ou à un drive
 * dépose l'échange ; l'analyse et la relecture se font dans le board (écran « À relire »).
 */
export function registerSources(server: McpServer, ctx: Ctx) {
  tool(
    server,
    'deposer_source',
    {
      title: 'Déposer un échange à analyser',
      description:
        'Envoie au board un échange (transcription de réunion, fil Slack, compte rendu, e-mail) recopié tel quel. ' +
        'Le board l’analyse et propose des mises à jour des Références, que les éditeurs relisent dans « À relire ». ' +
        'Ne résume pas le texte : la relecture s’appuie sur des citations exactes.',
      input: {
        titre: z.string().min(1).max(300).describe('Ex. « Réunion de suivi du 12/11 », « Fil #paiement »'),
        texte: z.string().min(20).max(400_000).describe('Texte intégral de l’échange'),
        date: z.iso.date().optional().describe('Date de l’échange, AAAA-MM-JJ'),
        lien: z.url().optional().describe('Lien vers l’original (fil Slack, réunion)'),
        participants: z.string().max(1000).optional(),
      },
      write: true,
    },
    async a => {
      const s = await ctx.api<SourceItem>('POST', '/sources', {
        title: a.titre,
        text: a.texte,
        origin: 'mcp',
        url: a.lien ?? '',
        occurredAt: a.date ?? null,
        participants: a.participants ?? '',
      });
      return s.error
        ? `${s.id} reçu, mais non analysé : ${s.error}`
        : `${s.id} reçu ; l’analyse est en cours. Les propositions apparaîtront dans « À relire ».`;
    },
  );

  tool(
    server,
    'propositions',
    {
      title: 'Propositions à relire',
      description:
        'Propositions de l’IA tirées des échanges, encore à relire dans le board, avec leur citation.',
      input: { source: z.string().optional().describe('Identifiant d’un échange (SRC-01) pour s’y limiter') },
    },
    async a => {
      const ws = await ctx.workspace();
      const list = ws.proposals.filter(
        (p: Proposal) => p.status === 'pending' && (!a.source || p.source === a.source),
      );
      if (!list.length) return 'Aucune proposition à relire.';
      return list
        .map(
          p =>
            `${p.id} · ${p.source} · ${p.target ? `mise à jour de ${p.target}` : 'nouvelle fiche'} · ${CONFIDENCE_LABEL[p.confidence]}\n` +
            `  ${p.fields.subject ?? ''}${p.fields.gaps ? ` · écart : ${p.fields.gaps}` : ''}\n  « ${p.quote} »`,
        )
        .join('\n');
    },
  );
}
