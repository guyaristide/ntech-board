import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  amount,
  burndown,
  byCount,
  casesOf,
  CAMPAIGN_MODE_LABEL,
  forecast,
  isBlocked,
  isDone,
  releaseProgress,
  SPRINT_STATUS_LABEL,
  stepOf,
  testSummary,
  velocity,
  type SprintDay,
  type Ticket,
  type WorkspaceData,
} from '@board/shared';
import { z } from 'zod';
import { lines, list, matches, pick, tool, type Ctx } from './context';

/** Outils de lecture de la partie Réalisation : tickets, sprints, pilotage, recette. */

const party = (ws: WorkspaceData, id: string) => ws.parties.find(p => p.id === id)?.name ?? '';
const row = (ws: WorkspaceData, t: Ticket) => {
  const sprint = ws.sprints.find(s => s.id === t.sprint)?.name ?? 'backlog';
  const step = stepOf(ws.settings, t.status)?.name ?? t.status;
  const est = t.estimate === null ? '' : ` · ${amount(t.estimate, ws.settings)}`;
  return `${t.id} · [${t.type} · ${step} · ${sprint}${est}] ${t.title}${t.assignee ? ` · ${party(ws, t.assignee)}` : ''}${isBlocked(ws.settings, ws.tickets, t) ? ' · BLOQUÉ' : ''}`;
};

export function registerDelivery(server: McpServer, ctx: Ctx) {
  tool(
    server,
    'tickets',
    {
      title: 'Lister les tickets',
      description:
        'Tickets de réalisation, triés par priorité, avec filtres. Étapes, types, sprints et responsables s’indiquent par identifiant ou par nom.',
      input: {
        texte: z.string().optional(),
        sprint: z.string().optional().describe('« actif », « backlog », ou identifiant / nom de sprint'),
        version: z.string().optional().describe('Identifiant ou nom de version'),
        etape: z.string().optional().describe('Étape du workflow, par exemple « En cours »'),
        responsable: z.string().optional().describe('Identifiant ou nom de partie prenante'),
        type: z.string().optional(),
        non_termines: z.boolean().default(false),
        limite: z.number().int().min(1).max(300).default(60),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      const s = ws.settings.delivery;
      const sprint =
        a.sprint === 'actif'
          ? (ws.sprints.find(x => x.status === 'active')?.id ?? '∅')
          : a.sprint === 'backlog'
            ? ''
            : a.sprint
              ? (pick(ws.sprints, a.sprint)?.id ?? '∅')
              : undefined;
      const release = a.version ? (pick(ws.releases, a.version)?.id ?? '∅') : undefined;
      const step = a.etape ? (pick(s.workflow, a.etape)?.id ?? '∅') : undefined;
      const type = a.type ? (pick(s.ticketTypes, a.type)?.id ?? '∅') : undefined;
      const who = a.responsable
        ? ws.parties
            .filter(p => p.id === a.responsable || matches(a.responsable, p.name, p.short))
            .map(p => p.id)
        : undefined;
      const rows = [...ws.tickets]
        .sort((x, y) => x.rank - y.rank)
        .filter(
          t =>
            (sprint === undefined || t.sprint === sprint) &&
            (release === undefined || t.release === release) &&
            (step === undefined || t.status === step) &&
            (type === undefined || t.type === type) &&
            (who === undefined || who.includes(t.assignee)) &&
            (!a.non_termines || !isDone(ws.settings, t)) &&
            matches(a.texte, t.id, t.title, ...t.description.map(b => b.text)),
        );
      return lines(
        `${rows.length} ticket(s)${rows.length > a.limite ? `, ${a.limite} premiers` : ''}`,
        list(rows.slice(0, a.limite), t => row(ws, t)),
      );
    },
  );

  tool(
    server,
    'lire_ticket',
    {
      title: 'Lire un ticket',
      description:
        'Fiche d’un ticket : étape, estimation, sprint, version, responsable, US liée et ses critères, sous-tâches, liaisons, description, commentaires.',
      input: { id: z.string().describe('Clé du ticket, par exemple ETO-12') },
    },
    async ({ id }) => {
      const ws = await ctx.workspace();
      const t = ws.tickets.find(x => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return `Ticket ${id} introuvable.`;
      const story = ws.stories.find(s => s.id === t.story);
      return lines(
        `# ${t.id} · ${t.title}`,
        row(ws, t),
        `Version : ${ws.releases.find(r => r.id === t.release)?.name ?? '—'} · prêt : ${t.ready.length}/${ws.settings.delivery.readiness.length} critères`,
        t.parent ? `Sous-tâche de ${t.parent}` : '',
        story
          ? `\nUS ${story.id} · ${story.title}\n${story.acceptance.map(c => `- ${c.text}`).join('\n')}`
          : '',
        t.description.length ? `\n## Description\n${t.description.map(b => b.text).join('\n')}` : '',
        ws.tickets.some(x => x.parent === t.id)
          ? `\n## Sous-tâches\n${ws.tickets
              .filter(x => x.parent === t.id)
              .map(x => `- ${row(ws, x)}`)
              .join('\n')}`
          : '',
        t.links.length ? `\n## Liaisons\n${t.links.map(l => `- ${l.type} ${l.ticket}`).join('\n')}` : '',
        t.comments.length
          ? `\n## Commentaires\n${t.comments.map(c => `- ${c.author}, ${c.at.slice(0, 10)} : ${c.text}`).join('\n')}`
          : '',
      );
    },
  );

  tool(
    server,
    'sprints',
    {
      title: 'Sprints',
      description:
        'Sprints du projet (prévus, en cours, clos) : dates, objectif, capacité, charge, vélocité.',
    },
    async () => {
      const ws = await ctx.workspace();
      return list(ws.sprints, s => {
        const own = ws.tickets.filter(t => t.sprint === s.id);
        const load = own.reduce((n, t) => n + (t.estimate ?? 0), 0);
        return `- ${s.id} · ${s.name} · ${SPRINT_STATUS_LABEL[s.status]} · ${s.start ?? '?'} → ${s.end ?? '?'} · ${own.length} tickets, ${amount(load, ws.settings)}${s.capacity ? ` / ${amount(s.capacity, ws.settings)}` : ''}${s.velocity !== null ? ` · livré ${amount(s.velocity, ws.settings)}` : ''}${s.goal ? ` · objectif : ${s.goal}` : ''}`;
      });
    },
  );

  tool(
    server,
    'pilotage',
    {
      title: 'Pilotage',
      description:
        'Où en est la réalisation : sprint en cours et burndown, vélocité, avancement et prévision de fin de chaque version, tickets bloqués.',
    },
    async () => {
      const ws = await ctx.workspace();
      const s = ws.settings;
      const count = byCount(s);
      const unit = (n: number) => (count ? `${n} tickets` : amount(n, s));
      const active = ws.sprints.find(x => x.status === 'active');
      const days = active ? await ctx.api<SprintDay[]>('GET', `/sprints/${active.id}/days`) : [];
      const b = active ? burndown(s, active, days) : null;
      const last = b?.points.filter(p => p.remaining !== null).at(-1);
      const v = velocity(ws.sprints, count);
      const blocked = ws.tickets.filter(t => !isDone(s, t) && isBlocked(s, ws.tickets, t));
      return lines(
        active
          ? `## ${active.name} (${active.start} → ${active.end})\nReste à faire : ${last ? unit(last.remaining!) : '—'} sur un périmètre de ${last ? unit(last.scope!) : '—'} ; rythme idéal ce jour : ${b && last ? unit(Math.round(b.points.find(p => p.day === last.day)!.ideal * 10) / 10) : '—'}.`
          : '## Aucun sprint en cours',
        `Vélocité moyenne (3 derniers sprints clos) : ${v.average === null ? 'inconnue' : unit(Math.round(v.average * 10) / 10)}`,
        '\n## Versions',
        list(
          ws.releases.filter(r => r.status !== 'Abandonnée'),
          r => {
            const p = releaseProgress(s, r, ws.tickets);
            const f = forecast(s, r, ws.tickets, ws.sprints);
            const done = count
              ? `${p.doneCount}/${p.count} tickets`
              : `${amount(p.done, s)} / ${amount(p.total, s)}`;
            return `- ${r.name} · ${r.status} · visée ${r.end ?? '—'} · ${done}${f.date ? ` · fin prévue ${f.date} (${f.sprints} sprints)${f.late ? ' EN RETARD' : ''}` : ''}`;
          },
        ),
        `\n## Tickets bloqués : ${blocked.length}`,
        list(blocked, t => `- ${row(ws, t)}`, '—'),
      );
    },
  );

  tool(
    server,
    'recette',
    {
      title: 'Recette',
      description:
        'Campagnes de recette et leur bilan ; avec un identifiant, le détail des cas de test (US, critère, résultat, constat, bug).',
      input: {
        campagne: z.string().optional().describe('Identifiant de campagne pour le détail'),
        seulement_a_passer: z.boolean().default(false),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      if (!a.campagne)
        return list(
          ws.campaigns,
          c => {
            const t = testSummary(casesOf(c, ws.stories).map(x => x.result?.status ?? ''));
            return `- ${c.id} · ${c.name} · ${c.status} · ${CAMPAIGN_MODE_LABEL[c.mode]} · ${t.ok} OK, ${t.ko} KO, ${t.reserve} réserves, ${t.todo} à passer`;
          },
          'Aucune campagne.',
        );
      const c = ws.campaigns.find(x => x.id.toLowerCase() === a.campagne!.toLowerCase());
      if (!c) return `Campagne ${a.campagne} introuvable.`;
      const cases = casesOf(c, ws.stories).filter(x => !a.seulement_a_passer || !x.result?.status);
      return lines(
        `# ${c.id} · ${c.name} (${c.status}, ${CAMPAIGN_MODE_LABEL[c.mode]})`,
        list(
          cases,
          x =>
            `- US ${x.story} · critère ${x.criterion.id} · [${x.result?.status || 'à passer'}] ${x.criterion.text}${x.result?.comment ? ` · constat : ${x.result.comment}` : ''}${x.result?.bug ? ` · bug ${x.result.bug}` : ''}`,
        ),
      );
    },
  );
}
