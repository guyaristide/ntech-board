import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PRIORITIES, STATUSES, VERSIONS, type Story, type Ticket, type WorkspaceData } from '@board/shared';
import { z } from 'zod';
import { ApiFailure, lines, matches, pick, tool, type Ctx } from './context';

/**
 * Outils d'écriture : chacun appelle la route de l'API qu'utilise l'interface, sous l'identité du
 * membre. Rien n'est supprimé par ces outils.
 */

const COMMENT_PATH = {
  us: 'stories',
  ticket: 'tickets',
  risque: 'risks',
  diligence: 'diligences',
  atelier: 'workshops',
} as const;
const block = (text: string) => ({ id: randomUUID().slice(0, 8), type: 'p' as const, text });

/** Partie prenante par identifiant, nom, sigle ou alias ; vide pour retirer. */
function party(ws: WorkspaceData, value: string) {
  if (!value) return '';
  const p =
    ws.parties.find(x => x.id === value) ??
    ws.parties.find(x => x.type !== 'organization' && matches(value, x.name, x.short, ...x.aliases));
  if (!p) throw new ApiFailure(`Partie prenante « ${value} » introuvable : voir l’outil parties_prenantes.`);
  return p.id;
}
function resolve<T extends { id: string; name: string }>(items: T[], value: string, what: string) {
  const x = pick(items, value);
  if (!x)
    throw new ApiFailure(
      `${what} « ${value} » inconnu(e). Valeurs possibles : ${items.map(i => i.name).join(', ')}.`,
    );
  return x.id;
}

export function registerWrite(server: McpServer, ctx: Ctx) {
  tool(
    server,
    'commenter',
    {
      title: 'Commenter',
      description:
        'Ajoute un commentaire, signé de votre nom, sur une US, un ticket, un risque, une diligence ou un atelier.',
      input: {
        cible: z.enum(['us', 'ticket', 'risque', 'diligence', 'atelier']),
        id: z.string(),
        texte: z.string().min(1).max(5000),
      },
      write: true,
    },
    async a => {
      await ctx.api('POST', `/${COMMENT_PATH[a.cible]}/${encodeURIComponent(a.id)}/comments`, {
        text: a.texte,
      });
      return `Commentaire ajouté sur ${a.cible} ${a.id}.`;
    },
  );

  tool(
    server,
    'modifier_us',
    {
      title: 'Modifier une US',
      description:
        'Modifie une user story : titre, récit, description, statut, version, priorité ; ajoute des critères d’acceptation ou en coche. Seuls les champs fournis changent.',
      input: {
        id: z.string(),
        titre: z.string().max(300).optional(),
        en_tant_que: z.string().max(2000).optional(),
        je_veux: z.string().max(2000).optional(),
        afin_de: z.string().max(2000).optional(),
        description: z.string().max(20000).optional(),
        statut: z.enum(STATUSES).optional(),
        version: z.enum(VERSIONS).optional(),
        priorite: z.enum(PRIORITIES).optional(),
        ajouter_criteres: z.array(z.string().min(1).max(4000)).max(50).optional(),
        cocher_criteres: z
          .array(z.string())
          .max(200)
          .optional()
          .describe('Identifiants de critères à marquer comme satisfaits'),
      },
      write: true,
    },
    async a => {
      const ws = await ctx.workspace();
      const s = ws.stories.find(x => x.id.toLowerCase() === a.id.toLowerCase());
      if (!s) throw new ApiFailure(`US ${a.id} introuvable.`);
      const patch: Partial<Story> = {};
      if (a.titre !== undefined) patch.title = a.titre;
      if (a.en_tant_que !== undefined) patch.asA = a.en_tant_que;
      if (a.je_veux !== undefined) patch.iWant = a.je_veux;
      if (a.afin_de !== undefined) patch.soThat = a.afin_de;
      if (a.description !== undefined) patch.description = a.description;
      if (a.statut) patch.status = a.statut;
      if (a.version) patch.version = a.version;
      if (a.priorite) patch.priority = a.priorite;
      if (a.ajouter_criteres?.length || a.cocher_criteres?.length)
        patch.acceptance = [
          ...s.acceptance.map(c => (a.cocher_criteres?.includes(c.id) ? { ...c, done: true } : c)),
          ...(a.ajouter_criteres ?? []).map(text => ({ id: randomUUID().slice(0, 8), text, done: false })),
        ];
      if (!Object.keys(patch).length) return 'Aucun champ à modifier.';
      await ctx.api('PATCH', `/stories/${encodeURIComponent(s.id)}`, patch);
      return `${s.id} modifiée : ${Object.keys(patch).join(', ')}.`;
    },
  );

  tool(
    server,
    'creer_us',
    {
      title: 'Créer une US',
      description:
        'Crée une user story dans une épique (identifiant attribué par le tableau, statut « À cadrer »).',
      input: {
        epique: z.string().describe('Identifiant d’épique, par exemple UC01'),
        titre: z.string().min(1).max(300),
        en_tant_que: z.string().max(2000).default(''),
        je_veux: z.string().max(2000).default(''),
        afin_de: z.string().max(2000).default(''),
        description: z.string().max(20000).default(''),
        criteres: z.array(z.string().min(1).max(4000)).max(50).default([]),
        version: z.enum(VERSIONS).optional(),
        priorite: z.enum(PRIORITIES).optional(),
      },
      write: true,
    },
    async a => {
      const s = await ctx.api<Story>('POST', '/stories', {
        epic: a.epique,
        patch: {
          title: a.titre,
          asA: a.en_tant_que,
          iWant: a.je_veux,
          soThat: a.afin_de,
          description: a.description,
          acceptance: a.criteres.map(text => ({ id: randomUUID().slice(0, 8), text, done: false })),
          ...(a.version ? { version: a.version } : {}),
          ...(a.priorite ? { priority: a.priorite } : {}),
        },
      });
      return `US créée : ${s.id} · ${s.title}.`;
    },
  );

  tool(
    server,
    'trancher_point',
    {
      title: 'Trancher un point',
      description:
        'Enregistre la réponse à un point à trancher d’une séquence d’atelier et change son statut (identifiants donnés par points_a_trancher).',
      input: {
        atelier: z.string(),
        sequence: z.string(),
        question: z.string(),
        reponse: z.string().max(5000).optional(),
        statut: z.enum(['Ouvert', 'Tranché', 'Reporté']).default('Tranché'),
      },
      write: true,
    },
    async a => {
      await ctx.api(
        'PATCH',
        `/workshops/${encodeURIComponent(a.atelier)}/sessions/${encodeURIComponent(a.sequence)}/questions/${encodeURIComponent(a.question)}`,
        {
          status: a.statut,
          ...(a.reponse !== undefined ? { answer: a.reponse } : {}),
        },
      );
      return `Point ${a.question} (${a.atelier} · ${a.sequence}) : ${a.statut}.`;
    },
  );

  tool(
    server,
    'ajouter_point',
    {
      title: 'Ajouter un point à trancher',
      description: 'Ajoute une question à une séquence d’atelier.',
      input: { atelier: z.string(), sequence: z.string(), texte: z.string().min(1).max(1000) },
      write: true,
    },
    async a => {
      await ctx.api(
        'POST',
        `/workshops/${encodeURIComponent(a.atelier)}/sessions/${encodeURIComponent(a.sequence)}/questions`,
        { text: a.texte },
      );
      return `Point ajouté à ${a.atelier} · ${a.sequence}.`;
    },
  );
}

/** Écritures de la partie Réalisation (éditeurs, sauf la saisie de recette, ouverte au client selon le mode). */
export function registerDeliveryWrite(server: McpServer, ctx: Ctx, editor: boolean) {
  const fields = async (a: {
    titre?: string;
    type?: string;
    etape?: string;
    estimation?: number | null;
    sprint?: string;
    version?: string;
    responsable?: string;
    description?: string;
  }) => {
    const ws = await ctx.workspace();
    const d = ws.settings.delivery;
    const patch: Partial<Ticket> = {};
    if (a.titre !== undefined) patch.title = a.titre;
    if (a.type) patch.type = resolve(d.ticketTypes, a.type, 'Type');
    if (a.etape) patch.status = resolve(d.workflow, a.etape, 'Étape');
    if (a.estimation !== undefined) patch.estimate = a.estimation;
    if (a.sprint !== undefined)
      patch.sprint =
        a.sprint === '' || a.sprint === 'backlog'
          ? ''
          : a.sprint === 'actif'
            ? (ws.sprints.find(s => s.status === 'active')?.id ?? resolve(ws.sprints, a.sprint, 'Sprint'))
            : resolve(ws.sprints, a.sprint, 'Sprint');
    if (a.version !== undefined)
      patch.release = a.version === '' ? '' : resolve(ws.releases, a.version, 'Version');
    if (a.responsable !== undefined) patch.assignee = party(ws, a.responsable);
    if (a.description !== undefined) patch.description = a.description ? [block(a.description)] : [];
    return patch;
  };
  const common = {
    type: z.string().optional().describe('Identifiant ou nom : US, Tâche, Bug…'),
    etape: z.string().optional().describe('Étape du workflow, par identifiant ou nom'),
    estimation: z.number().min(0).max(10000).nullable().optional(),
    sprint: z.string().optional().describe('« actif », « backlog », ou identifiant / nom de sprint'),
    version: z.string().optional().describe('Identifiant ou nom de version ; vide pour retirer'),
    responsable: z
      .string()
      .optional()
      .describe('Identifiant ou nom de personne ou de rôle ; vide pour retirer'),
    description: z.string().max(20000).optional(),
  };

  if (editor) {
    tool(
      server,
      'creer_ticket',
      {
        title: 'Créer un ticket',
        description:
          'Crée un ticket de réalisation. Avec « us », crée le ticket qui réalise cette US (une seule fois par US) ; sinon un ticket libre, au backlog par défaut.',
        input: {
          titre: z.string().min(1).max(500).optional(),
          us: z.string().optional(),
          parent: z.string().optional().describe('Clé du ticket parent (sous-tâche)'),
          ...common,
        },
        write: true,
      },
      async a => {
        const patch = { ...(await fields(a)), ...(a.parent ? { parent: a.parent } : {}) };
        if (a.us) {
          const created = await ctx.api<Ticket[]>('POST', '/tickets', { stories: [a.us], patch });
          if (!created.length)
            throw new ApiFailure(`L’US ${a.us} est introuvable ou a déjà son ticket : voir l’outil tickets.`);
          return `Ticket créé : ${created[0].id} · ${created[0].title}.`;
        }
        if (!a.titre) throw new ApiFailure('Indiquez un titre, ou une US à réaliser.');
        const [t] = await ctx.api<Ticket[]>('POST', '/tickets', { patch: { ...patch, title: a.titre } });
        return `Ticket créé : ${t.id} · ${t.title}.`;
      },
    );

    tool(
      server,
      'modifier_ticket',
      {
        title: 'Modifier un ticket',
        description:
          'Fait avancer ou replanifie un ticket : étape, estimation, sprint, version, responsable, titre, description. Seuls les champs fournis changent.',
        input: { id: z.string(), titre: z.string().min(1).max(500).optional(), ...common },
        write: true,
      },
      async a => {
        const patch = await fields(a);
        if (!Object.keys(patch).length) return 'Aucun champ à modifier.';
        const t = await ctx.api<Ticket>('PATCH', `/tickets/${encodeURIComponent(a.id)}`, patch);
        return `${t.id} modifié : ${Object.keys(patch).join(', ')}.`;
      },
    );
  }

  tool(
    server,
    'saisir_resultat_recette',
    {
      title: 'Saisir un résultat de recette',
      description:
        'Enregistre le résultat d’un cas de test (critère d’acceptation d’une US) dans une campagne : ok, ko, reserve, na, ou vide pour effacer. Le critère s’indique par identifiant ou par numéro (1, 2…).',
      input: {
        campagne: z.string(),
        us: z.string(),
        critere: z.string(),
        resultat: z.enum(['ok', 'ko', 'reserve', 'na', '']),
        constat: z.string().max(4000).default(''),
      },
      write: true,
    },
    async a => {
      const ws = await ctx.workspace();
      const story = ws.stories.find(s => s.id.toLowerCase() === a.us.toLowerCase());
      if (!story) throw new ApiFailure(`US ${a.us} introuvable.`);
      const n = Number(a.critere);
      const criterion =
        story.acceptance.find(c => c.id === a.critere) ??
        (Number.isInteger(n) ? story.acceptance[n - 1] : undefined);
      if (!criterion) throw new ApiFailure(`Critère ${a.critere} introuvable dans ${story.id}.`);
      await ctx.api(
        'PUT',
        `/campaigns/${encodeURIComponent(a.campagne)}/results/${encodeURIComponent(`${story.id}:${criterion.id}`)}`,
        {
          status: a.resultat,
          comment: a.constat,
        },
      );
      return lines(
        `Résultat enregistré : ${story.id} · « ${criterion.text} » → ${a.resultat || 'à passer'}.`,
        a.resultat === 'ko' ? 'Un bug peut être ouvert depuis la campagne dans le tableau.' : '',
      );
    },
  );
}
