import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { diligenceOpen, riskLevel, riskScore, STATUSES, ticketsOfStory, type Story } from '@board/shared';
import { z } from 'zod';
import { lines, list, matches, tool, type Ctx } from './context';

/** Outils de lecture du cadrage : projet, US, épiques, ateliers, points à trancher, risques, diligences, parties. */

const story = (s: Story) => `${s.id} · [${s.status} · ${s.version} · ${s.priority}] ${s.title}`;
const date = (iso: string | null) => iso ?? 'date à fixer';

export function registerRead(server: McpServer, ctx: Ctx) {
  tool(
    server,
    'projet',
    {
      title: 'Synthèse du projet',
      description:
        'Synthèse du tableau : US par statut, épiques, ateliers à venir, points ouverts, risques, diligences, et vos droits. À appeler en premier pour situer le projet.',
    },
    async () => {
      const ws = await ctx.workspace();
      const today = new Date().toISOString().slice(0, 10);
      const questions = ws.workshops.flatMap(w => w.sessions.flatMap(s => s.questions));
      const next = ws.workshops.filter(w => w.date && w.date >= today).slice(0, 3);
      return lines(
        `# ${ctx.project.title}`,
        `Connecté en tant que ${ctx.user.name || ctx.user.email}, rôle ${ctx.role}${ctx.role === 'viewer' ? ' (lecture seule)' : ''}.`,
        `Partie Réalisation : ${ctx.delivery ? 'visible' : 'non visible pour ce profil'}.`,
        '',
        `## Backlog : ${ws.stories.length} US, ${ws.epics.length} épiques`,
        STATUSES.map(st => `- ${st} : ${ws.stories.filter(s => s.status === st).length}`).join('\n'),
        '',
        `## Ateliers : ${ws.workshops.length}`,
        next.length
          ? next.map(w => `- ${w.id} · ${date(w.date)} · ${w.title}`).join('\n')
          : '- Aucun atelier à venir',
        `Points à trancher ouverts : ${questions.filter(q => q.status === 'Ouvert').length} sur ${questions.length}`,
        `Risques non clos : ${ws.risks.filter(r => r.status !== 'Clos').length} · diligences ouvertes : ${ws.diligences.filter(d => diligenceOpen(d.status)).length}`,
        ctx.delivery && ws.sprints.length
          ? `\n## Réalisation\n- Sprint en cours : ${ws.sprints.find(s => s.status === 'active')?.name ?? 'aucun'}\n- ${ws.tickets.length} tickets, ${ws.releases.length} versions (outil « pilotage » pour le détail)`
          : '',
      );
    },
  );

  tool(
    server,
    'rechercher_us',
    {
      title: 'Rechercher des US',
      description:
        'Recherche les user stories du backlog de cadrage (titre, récit, description, critères), avec filtres. Renvoie identifiant, statut, version, priorité et titre.',
      input: {
        texte: z.string().optional().describe('Mots à chercher (sans accents ni casse)'),
        epique: z.string().optional().describe('Identifiant d’épique, par exemple UC01'),
        statut: z.enum(STATUSES).optional(),
        version: z.string().optional().describe('Version ou lot (réglages du projet), ou « Hors périmètre »'),
        plateforme: z.string().optional(),
        limite: z.number().int().min(1).max(200).default(40),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      const found = ws.stories.filter(
        s =>
          (!a.epique || s.epic === a.epique) &&
          (!a.statut || s.status === a.statut) &&
          (!a.version || s.version === a.version) &&
          (!a.plateforme || (s.targets ?? []).some(t => matches(a.plateforme, t.platform))) &&
          matches(
            a.texte,
            s.id,
            s.title,
            s.description,
            s.asA,
            s.iWant,
            s.soThat,
            ...s.acceptance.map(c => c.text),
          ),
      );
      return lines(
        `${found.length} US${found.length > a.limite ? `, ${a.limite} premières` : ''}`,
        list(found.slice(0, a.limite), story),
      );
    },
  );

  tool(
    server,
    'lire_us',
    {
      title: 'Lire une US',
      description:
        'Fiche complète d’une user story : récit, description, critères d’acceptation, plateformes, liaisons, commentaires, et ses tickets de réalisation si visibles.',
      input: { id: z.string().describe('Identifiant, par exemple US-UC01-03') },
    },
    async ({ id }) => {
      const ws = await ctx.workspace();
      const s = ws.stories.find(x => x.id.toLowerCase() === id.toLowerCase());
      if (!s) return `US ${id} introuvable.`;
      const tickets = ticketsOfStory(ws.tickets, s.id);
      return lines(
        `# ${s.id} · ${s.title}`,
        `Épique ${s.epic} · statut ${s.status} · ${s.version} · ${s.priority} · scénario ${s.scenario}${s.workshop ? ` · atelier ${s.workshop}` : ''}`,
        s.asA || s.iWant
          ? `\nEn tant que ${s.asA}, je veux ${s.iWant}${s.soThat ? `, afin de ${s.soThat}` : ''}.`
          : '',
        s.description ? `\n${s.description}` : '',
        `\n## Critères d’acceptation\n${list(s.acceptance, c => `- [${c.done ? 'x' : ' '}] (${c.id}) ${c.text}`, 'Aucun.')}`,
        (s.targets ?? []).length
          ? `\n## Plateformes\n${s.targets.map(t => `- ${t.platform}${t.module ? ` › ${t.module}` : ''}`).join('\n')}`
          : '',
        (s.links ?? []).length
          ? `\n## Liaisons\n${s.links.map(l => `- ${l.type} ${l.story}`).join('\n')}`
          : '',
        s.source ? `\nSource : ${s.source}` : '',
        s.comments.length
          ? `\n## Commentaires\n${s.comments.map(c => `- ${c.author}, ${c.at.slice(0, 10)} : ${c.text}`).join('\n')}`
          : '',
        ctx.delivery && tickets.length
          ? `\n## Tickets\n${tickets.map(t => `- ${t.id} · ${t.status} · ${t.title}`).join('\n')}`
          : '',
      );
    },
  );

  tool(
    server,
    'lister_epiques',
    {
      title: 'Lister les épiques',
      description: 'Épiques (cas d’usage) du backlog, avec leur nombre d’US et d’US validées.',
    },
    async () => {
      const ws = await ctx.workspace();
      return list(ws.epics, e => {
        const own = ws.stories.filter(s => s.epic === e.id);
        return `${e.id} · ${e.title} · ${own.length} US, ${own.filter(s => s.status === 'Validée').length} validées`;
      });
    },
  );

  tool(
    server,
    'lister_ateliers',
    {
      title: 'Lister les ateliers',
      description:
        'Programme des ateliers de cadrage : date, titre, période, statut du PV, séquences et points ouverts.',
    },
    async () => {
      const ws = await ctx.workspace();
      return list(ws.workshops, w => {
        const open = w.sessions.flatMap(s => s.questions).filter(q => q.status === 'Ouvert').length;
        return `${w.id} · ${date(w.date)} · ${w.title} · ${w.sessions.length} séquences · ${open} points ouverts · PV ${w.pvStatus}`;
      });
    },
  );

  tool(
    server,
    'lire_atelier',
    {
      title: 'Lire un atelier',
      description:
        'Déroulé d’un atelier : séquences (horaires, porteur, contenu, résultat attendu) et leurs points à trancher avec identifiants.',
      input: { id: z.string().describe('Identifiant, par exemple J2') },
    },
    async ({ id }) => {
      const ws = await ctx.workspace();
      const w = ws.workshops.find(x => x.id.toLowerCase() === id.toLowerCase());
      if (!w) return `Atelier ${id} introuvable.`;
      return lines(
        `# ${w.id} · ${w.title}`,
        `${date(w.date)} · ${w.phase} · PV ${w.pvStatus}`,
        w.objectives.length ? `\nObjectifs :\n${w.objectives.map(o => `- ${o}`).join('\n')}` : '',
        ...w.sessions.map(s =>
          lines(
            `\n## ${s.code} · ${s.title}${s.allDay ? ' (journée)' : s.start ? ` (${s.start}–${s.end ?? ''})` : ''}`,
            s.owner ? `Porteur : ${s.owner}` : '',
            s.content,
            s.outcome ? `Résultat attendu : ${s.outcome}` : '',
            s.questions.length
              ? s.questions
                  .map(q => `- [${q.status}] (${q.id}) ${q.text}${q.answer ? ` → ${q.answer}` : ''}`)
                  .join('\n')
              : '',
          ),
        ),
      );
    },
  );

  tool(
    server,
    'points_a_trancher',
    {
      title: 'Points à trancher',
      description:
        'Questions posées dans les séquences d’ateliers, avec leur statut et leur réponse. Les identifiants servent à l’outil trancher_point.',
      input: {
        statut: z.enum(['Ouvert', 'Tranché', 'Reporté']).optional().describe('Par défaut : tous'),
        atelier: z.string().optional(),
        texte: z.string().optional(),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      const rows = ws.workshops
        .filter(w => !a.atelier || w.id.toLowerCase() === a.atelier.toLowerCase())
        .flatMap(w => w.sessions.flatMap(s => s.questions.map(q => ({ w, s, q }))))
        .filter(({ q }) => (!a.statut || q.status === a.statut) && matches(a.texte, q.text, q.answer));
      return lines(
        `${rows.length} point(s)`,
        list(
          rows,
          ({ w, s, q }) =>
            `- atelier ${w.id} · séquence ${s.code} · question ${q.id} · [${q.status}] ${q.text}${q.answer ? ` → ${q.answer}` : ''}`,
        ),
      );
    },
  );

  tool(
    server,
    'lister_risques',
    {
      title: 'Lister les risques',
      description:
        'Registre des risques : cotation résiduelle, niveau, statut, propriétaire, actions de traitement.',
      input: {
        statut: z.string().optional().describe('Proposé, Ouvert, En traitement, Survenu ou Clos'),
        niveau_min: z.enum(['Faible', 'Modéré', 'Élevé', 'Critique']).optional(),
        texte: z.string().optional(),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      const order = ['Faible', 'Modéré', 'Élevé', 'Critique'];
      const rows = ws.risks.filter(r => {
        const level = riskLevel(riskScore(r.residual) ?? riskScore(r.initial));
        return (
          (!a.statut || r.status === a.statut) &&
          (!a.niveau_min || order.indexOf(level) >= order.indexOf(a.niveau_min)) &&
          matches(a.texte, r.title, r.cause, r.consequence)
        );
      });
      return list(rows, r => {
        const score = riskScore(r.residual) ?? riskScore(r.initial);
        const actions = r.actions
          .map(x => `  - action [${x.status}] ${x.text} (${x.owner || '—'}, ${x.due || 'sans échéance'})`)
          .join('\n');
        return lines(
          `- ${r.id} · [${r.status} · ${riskLevel(score) || 'non coté'}${score ? ` ${score}` : ''}] ${r.title} · propriétaire ${r.owner || '—'}`,
          actions,
        );
      });
    },
  );

  tool(
    server,
    'lister_diligences',
    {
      title: 'Lister les diligences',
      description:
        'Diligences issues des ateliers : ce qu’une partie s’est engagée à produire, étudier, trancher ou fournir.',
      input: {
        ouvertes: z.boolean().default(true).describe('Seulement les diligences ouvertes'),
        responsable: z.string().optional(),
      },
    },
    async a => {
      const ws = await ctx.workspace();
      const rows = ws.diligences.filter(
        d => (!a.ouvertes || diligenceOpen(d.status)) && matches(a.responsable, d.owner, d.partners),
      );
      return list(
        rows,
        d =>
          `- ${d.id} · [${d.status} · ${d.kind}] ${d.title} · ${d.owner || '—'} · échéance ${d.due || '—'}`,
      );
    },
  );

  tool(
    server,
    'parties_prenantes',
    {
      title: 'Parties prenantes',
      description:
        'Référentiel des parties prenantes : organisations, personnes et rôles, avec leurs identifiants (utiles pour attribuer un ticket).',
    },
    async () => {
      const ws = await ctx.workspace();
      const name = (id: string) => ws.parties.find(p => p.id === id)?.name ?? '';
      return list(
        ws.parties,
        p =>
          `- ${p.id} · ${p.type} · ${p.name}${p.short ? ` (${p.short})` : ''}${p.organization ? ` · ${name(p.organization)}` : ''}${p.holder ? ` · tenu par ${name(p.holder)}` : ''}${p.function ? ` · ${p.function}` : ''}`,
      );
    },
  );
}
