import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  byUrgency,
  FINDING_NATURES,
  FINDING_NATURE_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  FINDING_STATUS_LABEL,
  FINDING_STATUSES,
  findingSummary,
  isOpenFinding,
  type Finding,
  type Ticket,
} from '@board/shared';
import { lines, list, tool, type Ctx } from './context';

/** Retours de recette par le MCP : les lire, en signaler un, le qualifier, donner le résultat d'un retest. */

const row = (f: Finding) =>
  `- ${f.id} · [${FINDING_STATUS_LABEL[f.status]}] ${FINDING_SEVERITY_LABEL[f.severity]} · ${FINDING_NATURE_LABEL[f.nature]} · ${f.title}${f.ticket ? ` · ticket ${f.ticket}` : ''} · campagne ${f.campaign} · par ${f.reporterName}`;

export function registerFindings(server: McpServer, ctx: Ctx, write: boolean) {
  tool(
    server,
    'list_findings',
    {
      title: 'Retours de recette',
      description:
        'Retours de recette (anomalies, demandes d’évolution, questions, remarques) : liste filtrable, ou le détail d’un retour avec son historique. Par défaut, seulement les retours ouverts.',
      input: {
        id: z.string().optional().describe('Identifiant d’un retour (RET-03) pour son détail'),
        campaign: z.string().optional().describe('Identifiant de campagne (REC-01)'),
        status: z
          .enum(FINDING_STATUSES)
          .optional()
          .describe('new (à qualifier), open (en correction), retest, closed, rejected'),
        include_closed: z.boolean().default(false),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      const all = ws.findings ?? [];
      if (a.id) {
        const f = all.find(x => x.id.toLowerCase() === a.id!.toLowerCase());
        if (!f) return `Retour ${a.id} introuvable.`;
        return lines(
          `# ${f.id} · ${f.title}`,
          `${FINDING_STATUS_LABEL[f.status]} · ${FINDING_SEVERITY_LABEL[f.severity]} · ${FINDING_NATURE_LABEL[f.nature]} · campagne ${f.campaign}${f.story ? ` · US ${f.story}` : ''}${f.ticket ? ` · ticket ${f.ticket}` : ''}`,
          `Signalé par ${f.reporterName} le ${f.createdAt.slice(0, 10)}`,
          f.steps && `\n## Pour reproduire\n${f.steps}`,
          f.expected && `\n## Attendu\n${f.expected}`,
          f.actual && `\n## Constaté\n${f.actual}`,
          f.environment && `\n## Environnement\n${f.environment}`,
          f.reason && `\nMotif du rejet : ${f.reason}`,
          '\n## Historique',
          list(
            f.history,
            h =>
              `- ${h.at.slice(0, 16).replace('T', ' ')} · ${h.by} · ${h.from ? `${FINDING_STATUS_LABEL[h.from]} → ` : ''}${FINDING_STATUS_LABEL[h.to]}${h.note ? ` · ${h.note}` : ''}`,
          ),
        );
      }
      const shown = all
        .filter(f => !a.campaign || f.campaign.toLowerCase() === a.campaign.toLowerCase())
        .filter(f => (a.status ? f.status === a.status : a.include_closed || isOpenFinding(f)))
        .sort(byUrgency);
      const s = findingSummary(
        all.filter(f => !a.campaign || f.campaign.toLowerCase() === a.campaign.toLowerCase()),
      );
      return lines(
        `${s.open} retour(s) ouvert(s) sur ${s.total} : ${FINDING_SEVERITIES.map(k => `${s.bySeverity[k]} ${FINDING_SEVERITY_LABEL[k].toLowerCase()}`).join(', ')} ; ${s.toQualify} à qualifier, ${s.toRetest} à retester.`,
        list(shown, row, 'Aucun retour dans cette sélection.'),
      );
    },
  );

  tool(
    server,
    'report_finding',
    {
      title: 'Signaler un retour de recette',
      description:
        'Dépose un retour dans une campagne de recette : anomalie, demande d’évolution, question ou remarque. Il arrive « à qualifier ».',
      write: true,
      input: {
        campaign: z.string().describe('Identifiant de la campagne (REC-01)'),
        title: z.string().min(1).max(300),
        nature: z
          .enum(FINDING_NATURES)
          .default('bug')
          .describe('bug (anomalie), change (évolution), question, remark'),
        severity: z.enum(FINDING_SEVERITIES).default('major').describe('blocking, major, minor, cosmetic'),
        steps: z.string().max(6000).optional().describe('Étapes pour reproduire'),
        expected: z.string().max(6000).optional(),
        actual: z.string().max(6000).optional(),
        environment: z.string().max(500).optional(),
        case_key: z.string().optional().describe('Cas de test concerné : « US:critère »'),
      },
    },
    async a => {
      const { case_key, ...rest } = a;
      const f = await ctx.api<Finding>('POST', '/findings', {
        ...rest,
        ...(case_key ? { caseKey: case_key } : {}),
      });
      return `Retour ${f.id} signalé (${FINDING_SEVERITY_LABEL[f.severity]}), à qualifier.`;
    },
  );

  if (!write) return;
  tool(
    server,
    'update_finding',
    {
      title: 'Qualifier ou retester un retour',
      description:
        'Fait avancer un retour de recette. accept : le met en correction (create_ticket=true ouvre un ticket, ticket=… en rattache un). reject : l’écarte, avec un motif. retest_ok / retest_ko : résultat d’un retest (clôt le retour, ou le renvoie en correction et rouvre son ticket). reopen, close. La gravité peut être corrigée en même temps.',
      write: true,
      input: {
        id: z.string().describe('Identifiant du retour (RET-03)'),
        action: z.enum(['accept', 'reject', 'retest_ok', 'retest_ko', 'reopen', 'close']).optional(),
        severity: z.enum(FINDING_SEVERITIES).optional(),
        ticket: z.string().optional().describe('Ticket existant à rattacher (avec accept)'),
        create_ticket: z.boolean().default(false),
        note: z.string().max(500).optional().describe('Motif du rejet, ou constat du retest'),
      },
    },
    async a => {
      const path = `/findings/${encodeURIComponent(a.id)}`;
      const done: string[] = [];
      if (a.severity) {
        await ctx.api('PATCH', path, { severity: a.severity });
        done.push(`gravité ${FINDING_SEVERITY_LABEL[a.severity]}`);
      }
      if (a.action === 'retest_ok' || a.action === 'retest_ko') {
        const f = await ctx.api<Finding>('POST', `${path}/retest`, {
          fixed: a.action === 'retest_ok',
          note: a.note ?? '',
        });
        done.push(FINDING_STATUS_LABEL[f.status].toLowerCase());
      } else if (a.action) {
        const body =
          a.action === 'accept'
            ? { action: 'accept', ...(a.ticket ? { ticket: a.ticket } : {}), create: a.create_ticket }
            : a.action === 'reject'
              ? { action: 'reject', reason: a.note ?? '' }
              : { action: a.action, note: a.note ?? '' };
        const r = await ctx.api<Finding | { finding: Finding; ticket: Ticket | null }>(
          'POST',
          `${path}/decision`,
          body,
        );
        const f = 'finding' in r ? r.finding : r;
        done.push(
          `${FINDING_STATUS_LABEL[f.status].toLowerCase()}${f.ticket ? ` (ticket ${f.ticket})` : ''}`,
        );
      }
      return done.length
        ? `${a.id} : ${done.join(', ')}.`
        : 'Rien à faire : indiquez une action ou une gravité.';
    },
  );
}
