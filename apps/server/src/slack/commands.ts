import {
  isDone,
  partiesOfUser,
  pathOf,
  slackEscape,
  slackLink,
  stepOf,
  type SlackCommand,
  type Ticket,
  type WorkspaceData,
} from '@board/shared';

/**
 * Commande « /board » tapée dans Slack. Chaque action passe par l'API du tableau au nom du membre
 * relié au compte Slack : mêmes droits, même journal, mêmes notifications que depuis l'interface.
 */

export type Api = <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;
/** Réponse à Slack : visible de tout le canal (`shared`) ou seulement de la personne. */
export interface Reply {
  text: string;
  shared?: boolean;
}

export const HELP = [
  '*NTECH Board dans Slack*',
  '`/board ticket Titre du ticket` : crée un ticket',
  '`/board ETO-12` : affiche un ticket, une US, un risque ou une diligence',
  '`/board chercher paiement mobile` : cherche dans le projet',
  '`/board mes tickets` : mes tickets en cours',
  '`/board statut ETO-12 en revue` : change l’étape d’un ticket',
  '`/board commenter ETO-12 Mon message` : écrit dans le fil d’un élément',
  '`/board note Texte d’un échange…` : dépose un échange dans « À relire »',
  '`/board delier` : détache ce compte Slack de votre compte du tableau',
].join('\n');

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface Found {
  kind: 'ticket' | 'story' | 'risk' | 'diligence';
  id: string;
  title: string;
  meta: string;
  text: string;
}

function index(ws: WorkspaceData): Found[] {
  const step = (t: Ticket) => stepOf(ws.settings, t.status)?.name ?? t.status;
  return [
    ...ws.tickets.map((t): Found => ({
      kind: 'ticket',
      id: t.id,
      title: t.title,
      meta: `Ticket · ${step(t)}`,
      text: `${t.id} ${t.title} ${(t.labels ?? []).join(' ')}`,
    })),
    ...ws.stories.map((s): Found => ({
      kind: 'story',
      id: s.id,
      title: s.title,
      meta: `US · ${s.status}`,
      text: `${s.id} ${s.title} ${s.description} ${s.actor}`,
    })),
    ...ws.risks.map((r): Found => ({
      kind: 'risk',
      id: r.id,
      title: r.title,
      meta: `Risque · ${r.status}`,
      text: `${r.id} ${r.title} ${r.cause} ${r.consequence}`,
    })),
    ...ws.diligences.map((d): Found => ({
      kind: 'diligence',
      id: d.id,
      title: d.title,
      meta: `Diligence · ${d.status}`,
      text: `${d.id} ${d.title} ${d.detail} ${d.owner}`,
    })),
  ];
}

const line = (origin: string, f: Found) =>
  `• ${slackLink(`${origin}${pathOf(f.kind, f.id)}`, `${f.id} · ${f.title || 'Sans titre'}`)}  _${slackEscape(f.meta)}_`;

export async function runSlackCommand(
  cmd: SlackCommand,
  ctx: {
    api: Api;
    origin: string;
    userId: string;
    channel: string;
    slackName: string;
    /** Le canal relié reçoit déjà les événements des tickets : la réponse reste privée, sans doublon. */
    ticketsPublished: boolean;
  },
): Promise<Reply> {
  const { api, origin } = ctx;
  const workspace = () => api<WorkspaceData>('GET', '/workspace');
  const find = async (id: string) => {
    const all = index(await workspace());
    return all.find(f => f.id.toLowerCase() === id.toLowerCase()) ?? null;
  };
  switch (cmd.name) {
    case 'help':
    case 'unlink':
      return { text: HELP };
    case 'create': {
      const [t] = await api<Ticket[]>('POST', '/tickets', { patch: { title: cmd.title.slice(0, 500) } });
      return {
        shared: !ctx.ticketsPublished,
        text: `Ticket créé : ${slackLink(`${origin}${pathOf('ticket', t.id)}`, `${t.id} · ${t.title}`)}`,
      };
    }
    case 'search': {
      const words = plain(cmd.query).split(' ').filter(Boolean);
      const hits = index(await workspace()).filter(f => words.every(w => plain(f.text).includes(w)));
      if (!hits.length) return { text: `Aucun résultat pour « ${slackEscape(cmd.query)} ».` };
      const more = hits.length > 8 ? `\n… et ${hits.length - 8} autres : précisez la recherche.` : '';
      return {
        text: `*${hits.length} résultat(s) pour « ${slackEscape(cmd.query)} »*\n${hits
          .slice(0, 8)
          .map(f => line(origin, f))
          .join('\n')}${more}`,
      };
    }
    case 'show': {
      const ws = await workspace();
      const f = index(ws).find(x => x.id.toLowerCase() === cmd.id.toLowerCase());
      if (!f)
        return { text: `« ${slackEscape(cmd.id)} » est introuvable (ou n’est pas visible de votre profil).` };
      const head = `*${slackLink(`${origin}${pathOf(f.kind, f.id)}`, `${f.id} · ${f.title || 'Sans titre'}`)}*\n${slackEscape(f.meta)}`;
      if (f.kind !== 'ticket') return { text: head };
      const t = ws.tickets.find(x => x.id === f.id)!;
      const who = ws.parties.find(p => p.id === t.assignee)?.name;
      const sprint = ws.sprints.find(s => s.id === t.sprint)?.name;
      const facts = [
        who ? `Responsable : ${who}` : 'Sans responsable',
        sprint ? `Sprint : ${sprint}` : 'Au backlog',
        t.estimate !== null ? `Estimation : ${t.estimate}` : '',
        t.due ? `Échéance : ${t.due}` : '',
      ].filter(Boolean);
      return { text: `${head}\n${slackEscape(facts.join(' · '))}` };
    }
    case 'mine': {
      const ws = await workspace();
      const mine = partiesOfUser(ws.parties, ctx.userId);
      const open = ws.tickets.filter(t => mine.includes(t.assignee) && !isDone(ws.settings, t));
      if (!open.length) return { text: 'Aucun ticket en cours ne vous est attribué.' };
      const all = index(ws);
      return {
        text: `*Vos ${open.length} ticket(s) en cours*\n${open
          .slice(0, 15)
          .map(t =>
            line(
              origin,
              all.find(f => f.kind === 'ticket' && f.id === t.id)!,
            ),
          )
          .join('\n')}`,
      };
    }
    case 'status': {
      const ws = await workspace();
      const t = ws.tickets.find(x => x.id.toLowerCase() === cmd.id.toLowerCase());
      if (!t) return { text: `Ticket « ${slackEscape(cmd.id)} » introuvable.` };
      const steps = ws.settings.delivery.workflow;
      const step = steps.find(s => s.id === cmd.step) ?? steps.find(s => plain(s.name) === plain(cmd.step));
      if (!step)
        return {
          text: `Étape « ${slackEscape(cmd.step)} » inconnue. Étapes du projet : ${steps.map(s => s.name).join(', ')}.`,
        };
      await api('PATCH', `/tickets/${encodeURIComponent(t.id)}`, { status: step.id });
      return {
        shared: !ctx.ticketsPublished,
        text: `${slackLink(`${origin}${pathOf('ticket', t.id)}`, `${t.id} · ${t.title}`)} passe à *${slackEscape(step.name)}*`,
      };
    }
    case 'comment': {
      const f = await find(cmd.id);
      if (!f) return { text: `« ${slackEscape(cmd.id)} » est introuvable.` };
      await api('POST', '/comments', { target: { kind: f.kind, id: f.id }, text: cmd.text });
      return { text: `Message ajouté au fil de ${slackLink(`${origin}${pathOf(f.kind, f.id)}`, f.id)}.` };
    }
    case 'note': {
      if (cmd.text.length < 20) return { text: 'Un échange fait au moins 20 caractères.' };
      const s = await api<{ id: string }>('POST', '/sources', {
        title: `Slack · #${ctx.channel} · ${ctx.slackName}`,
        text: cmd.text,
        origin: 'paste',
        occurredAt: new Date().toISOString().slice(0, 10),
        participants: ctx.slackName,
      });
      return { text: `Échange déposé (${s.id}) : ${slackLink(`${origin}/a-relire`, 'À relire')}.` };
    }
  }
}
