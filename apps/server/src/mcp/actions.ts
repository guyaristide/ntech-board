import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ATTACHABLE_KINDS, LINK_TYPES, TICKET_LINK_TYPES, type Sprint } from '@board/shared';
import { z } from 'zod';
import { SprintPlan, SprintReplan } from '../routes/deliverySchemas';
import { AgendaBody, SessionPatch } from '../routes/programmeSchemas';
import { RaciRowCreate, RaciRowPatch, RiskActionPatch, RiskReviewCreate } from '../routes/schemas';
import { ApiFailure, tool, type Ctx } from './context';

/** Outils sur le contenu des éléments : séquences, RACI, actions de risque, liaisons, fichiers, sprints. */
const q = encodeURIComponent;

export function registerActions(server: McpServer, ctx: Ctx) {
  const session = (a: { atelier: string; sequence: string }) =>
    `/workshops/${q(a.atelier)}/sessions/${q(a.sequence)}`;
  tool(
    server,
    'creer_sequence',
    {
      title: 'Créer une séquence d’atelier',
      description: 'Ajoute une séquence à un atelier ; la réponse donne son code.',
      input: { atelier: z.string(), ...SessionPatch.shape },
      write: true,
    },
    async ({ atelier, ...patch }) => {
      const w = await ctx.api<{ sessions: { code: string }[] }>('POST', `/workshops/${q(atelier)}/sessions`, {
        patch,
      });
      return `Séquence créée : ${atelier} · ${w.sessions.at(-1)?.code}.`;
    },
  );
  tool(
    server,
    'modifier_sequence',
    {
      title: 'Modifier une séquence d’atelier',
      description:
        'Modifie une séquence : horaires, contenu, porteur, résultat attendu, étapes. Seuls les champs fournis changent.',
      input: { atelier: z.string(), sequence: z.string(), ...SessionPatch.shape },
      write: true,
    },
    async ({ atelier, sequence, ...patch }) => {
      await ctx.api('PATCH', session({ atelier, sequence }), patch);
      return `Séquence ${atelier} · ${sequence} modifiée.`;
    },
  );
  tool(
    server,
    'ordre_du_jour',
    {
      title: 'Fixer l’ordre du jour d’un atelier',
      description:
        'Remplace l’ordre du jour d’un atelier : les séquences (par code) et les pauses, dans l’ordre.',
      input: { atelier: z.string(), ...AgendaBody.shape },
      write: true,
    },
    async ({ atelier, agenda }) => {
      await ctx.api('PUT', `/workshops/${q(atelier)}/agenda`, { agenda });
      return `Ordre du jour de ${atelier} enregistré (${agenda.length} entrées).`;
    },
  );

  tool(
    server,
    'lier_us',
    {
      title: 'Lier deux US',
      description: 'Pose une liaison entre deux US ; la liaison inverse est posée sur l’autre US.',
      input: { us: z.string(), autre: z.string(), type: z.enum(LINK_TYPES) },
      write: true,
    },
    async a => {
      await ctx.api('POST', `/stories/${q(a.us)}/links`, { story: a.autre, type: a.type });
      return `Liaison posée : ${a.us} ${a.type} ${a.autre}.`;
    },
  );
  tool(
    server,
    'delier_us',
    {
      title: 'Retirer la liaison entre deux US',
      description: 'Retire la liaison des deux côtés.',
      input: { us: z.string(), autre: z.string() },
      write: true,
    },
    async a => {
      await ctx.api('DELETE', `/stories/${q(a.us)}/links/${q(a.autre)}`);
      return `Liaison retirée entre ${a.us} et ${a.autre}.`;
    },
  );
  tool(
    server,
    'dupliquer_us',
    {
      title: 'Dupliquer une US',
      description: 'Crée une copie de l’US dans la même épique ; la réponse donne son identifiant.',
      input: { us: z.string() },
      write: true,
    },
    async a => {
      const s = await ctx.api<{ id: string }>('POST', `/stories/${q(a.us)}/duplicate`);
      return `Copie créée : ${s.id}.`;
    },
  );

  tool(
    server,
    'ajouter_ligne_raci',
    {
      title: 'Ajouter une ligne RACI',
      description:
        'Ajoute une activité à la matrice RACI d’une phase, puis remplit ses cellules si elles sont fournies.',
      input: { phase: z.string(), ...RaciRowCreate.shape, cells: RaciRowPatch.shape.cells },
      write: true,
    },
    async ({ phase, cells, ...row }) => {
      const p = await ctx.api<{ raci: { id: string }[] }>('POST', `/phases/${q(phase)}/raci`, row);
      const at = row.after ? p.raci.findIndex(r => r.id === row.after) + 1 : p.raci.length - 1;
      const id = p.raci[at]?.id;
      if (cells && id) await ctx.api('PATCH', `/phases/${q(phase)}/raci/${q(id)}`, { cells });
      return `Ligne RACI ajoutée à ${phase}${id ? ` : ${id}` : ''}.`;
    },
  );
  tool(
    server,
    'modifier_ligne_raci',
    {
      title: 'Modifier une ligne RACI',
      description:
        'Modifie l’activité, le livrable ou des cellules (par identifiant d’acteur : R, A, C, I ou vide).',
      input: { phase: z.string(), ligne: z.string(), ...RaciRowPatch.shape },
      write: true,
    },
    async ({ phase, ligne, ...patch }) => {
      await ctx.api('PATCH', `/phases/${q(phase)}/raci/${q(ligne)}`, patch);
      return `Ligne RACI ${ligne} modifiée.`;
    },
  );

  tool(
    server,
    'ajouter_action_risque',
    {
      title: 'Ajouter une action à un risque',
      description: 'Ajoute une action de traitement au risque.',
      input: { risque: z.string(), ...RiskActionPatch.shape },
      write: true,
    },
    async ({ risque, ...action }) => {
      await ctx.api('POST', `/risks/${q(risque)}/actions`, action);
      return `Action ajoutée au risque ${risque}.`;
    },
  );
  tool(
    server,
    'modifier_action_risque',
    {
      title: 'Modifier une action de risque',
      description: 'Modifie une action de traitement. Seuls les champs fournis changent.',
      input: { risque: z.string(), action: z.string(), ...RiskActionPatch.shape },
      write: true,
    },
    async ({ risque, action, ...patch }) => {
      await ctx.api('PATCH', `/risks/${q(risque)}/actions/${q(action)}`, patch);
      return `Action ${action} du risque ${risque} modifiée.`;
    },
  );
  tool(
    server,
    'revue_risque',
    {
      title: 'Enregistrer la revue d’un risque',
      description: 'Ajoute une revue au risque, rattachée à une phase, avec un commentaire.',
      input: { risque: z.string(), ...RiskReviewCreate.shape },
      write: true,
    },
    async ({ risque, ...review }) => {
      await ctx.api('POST', `/risks/${q(risque)}/reviews`, review);
      return `Revue enregistrée sur ${risque}.`;
    },
  );

  tool(
    server,
    'joindre_fichier',
    {
      title: 'Joindre un fichier',
      description:
        'Joint un fichier à un élément. Contenu encodé en base64 ; taille et types selon les réglages du projet (5 Mo au plus).',
      input: {
        cible: z.enum(ATTACHABLE_KINDS),
        id: z.string(),
        nom: z.string().min(1).max(200).describe('Nom du fichier, avec son extension'),
        contenu_base64: z.string().min(1),
      },
      write: true,
    },
    async a => {
      const form = new FormData();
      form.append('kind', a.cible);
      form.append('id', a.id);
      form.append('file', new File([Buffer.from(a.contenu_base64, 'base64')], a.nom));
      const f = await ctx.api<{ id: string }>('POST', '/attachments', form);
      return `Fichier joint à ${a.cible} ${a.id} : ${f.id}.`;
    },
  );

  if (!ctx.deletions) return;
  const removal = (name: string, title: string, input: z.ZodRawShape, path: (a: never) => string) =>
    tool(
      server,
      name,
      {
        title,
        description: `${title}, définitivement. Demandez confirmation à l’utilisateur avant d’appeler cet outil.`,
        input,
        write: true,
        destructive: true,
      },
      async a => {
        await ctx.api('DELETE', path(a as never));
        return 'Supprimé.';
      },
    );
  const [atelier, sequence, risque, phase] = [z.string(), z.string(), z.string(), z.string()];
  removal(
    'supprimer_us',
    'Supprimer une US',
    { id: z.string() },
    (a: { id: string }) => `/stories/${q(a.id)}`,
  );
  removal('supprimer_sequence', 'Supprimer une séquence', { atelier, sequence }, session as never);
  removal(
    'supprimer_ligne_raci',
    'Supprimer une ligne RACI',
    { phase, ligne: z.string() },
    (a: { phase: string; ligne: string }) => `/phases/${q(a.phase)}/raci/${q(a.ligne)}`,
  );
  removal(
    'supprimer_action_risque',
    'Supprimer une action de risque',
    { risque, action: z.string() },
    (a: { risque: string; action: string }) => `/risks/${q(a.risque)}/actions/${q(a.action)}`,
  );
  removal(
    'supprimer_piece_jointe',
    'Supprimer une pièce jointe',
    { id: z.string() },
    (a: { id: string }) => `/attachments/${q(a.id)}`,
  );
}

/** Réalisation (éditeurs) : planification des sprints, liaisons de tickets, recette. */
export function registerDeliveryActions(server: McpServer, ctx: Ctx) {
  const sprintOf = async (value: string) => {
    const ws = await ctx.workspace();
    const s = ws.sprints.find(x => x.id === value || x.name === value);
    if (!s) throw new ApiFailure(`Sprint « ${value} » introuvable : voir l’outil sprints.`);
    return s;
  };
  tool(
    server,
    'planifier_sprints',
    {
      title: 'Planifier les sprints d’une version',
      description:
        'Crée d’un coup les sprints d’une version : du lundi au vendredi, enchaînés, jusqu’à une date (until) ou en nombre (count).',
      input: { version: z.string(), ...SprintPlan.shape },
      write: true,
    },
    async ({ version, ...plan }) => {
      const made = await ctx.api<Sprint[]>('POST', `/releases/${q(version)}/sprints`, plan);
      return `${made.length} sprint(s) créé(s) : ${made.map(s => s.name).join(', ')}.`;
    },
  );
  tool(
    server,
    'replanifier_sprints',
    {
      title: 'Replanifier les sprints d’une version',
      description:
        'Réenchaîne les sprints pas encore commencés à partir d’une date (start), sur une durée (weeks), et/ou change leur capacité.',
      input: { version: z.string(), ...SprintReplan.shape },
      write: true,
    },
    async ({ version, ...plan }) => {
      const made = await ctx.api<Sprint[]>('PATCH', `/releases/${q(version)}/sprints`, plan);
      return `Sprints de ${version} mis à jour (${made.length}).`;
    },
  );
  tool(
    server,
    'demarrer_sprint',
    {
      title: 'Démarrer un sprint',
      description: 'Démarre un sprint prévu. Un seul sprint est en cours à la fois.',
      input: { sprint: z.string() },
      write: true,
    },
    async a => {
      const s = await sprintOf(a.sprint);
      await ctx.api('POST', `/sprints/${q(s.id)}/start`);
      return `${s.name} démarré.`;
    },
  );
  tool(
    server,
    'cloturer_sprint',
    {
      title: 'Clôturer un sprint',
      description:
        'Clôture le sprint en cours ; les tickets non terminés vont au backlog, ou dans le sprint indiqué.',
      input: { sprint: z.string(), reporter_vers: z.string().optional() },
      write: true,
    },
    async a => {
      const s = await sprintOf(a.sprint);
      const moveTo = a.reporter_vers ? (await sprintOf(a.reporter_vers)).id : '';
      await ctx.api('POST', `/sprints/${q(s.id)}/close`, { moveTo });
      return `${s.name} clôturé.`;
    },
  );
  tool(
    server,
    'lier_tickets',
    {
      title: 'Lier deux tickets',
      description: 'Pose une liaison entre deux tickets, des deux côtés.',
      input: { ticket: z.string(), autre: z.string(), type: z.enum(TICKET_LINK_TYPES) },
      write: true,
    },
    async a => {
      await ctx.api('POST', `/tickets/${q(a.ticket)}/links`, { ticket: a.autre, type: a.type });
      return `Liaison posée : ${a.ticket} ${a.type} ${a.autre}.`;
    },
  );
  tool(
    server,
    'delier_tickets',
    {
      title: 'Retirer la liaison entre deux tickets',
      description: 'Retire la liaison des deux côtés.',
      input: { ticket: z.string(), autre: z.string() },
      write: true,
    },
    async a => {
      await ctx.api('DELETE', `/tickets/${q(a.ticket)}/links/${q(a.autre)}`);
      return `Liaison retirée entre ${a.ticket} et ${a.autre}.`;
    },
  );
  tool(
    server,
    'completer_perimetre_recette',
    {
      title: 'Compléter le périmètre d’une campagne',
      description: 'Ajoute au périmètre de la campagne les US de sa version qui n’y sont pas encore.',
      input: { campagne: z.string() },
      write: true,
    },
    async a => {
      const c = await ctx.api<{ scope: string[] }>('POST', `/campaigns/${q(a.campagne)}/scope`);
      return `Périmètre de ${a.campagne} : ${c.scope.length} US.`;
    },
  );
  tool(
    server,
    'ouvrir_bug_recette',
    {
      title: 'Ouvrir un bug depuis la recette',
      description:
        'Ouvre un ticket de bug depuis un cas KO ou en réserve, relié à l’US et à son ticket. Le cas s’indique « US:critère ».',
      input: { campagne: z.string(), cas: z.string().describe('US-UC01-01:abcd1234') },
      write: true,
    },
    async a => {
      const r = await ctx.api<{ bug?: { id: string } }>(
        'POST',
        `/campaigns/${q(a.campagne)}/results/${q(a.cas)}/bug`,
      );
      return `Bug ouvert${r.bug ? ` : ${r.bug.id}` : ''}.`;
    },
  );
  if (ctx.deletions)
    tool(
      server,
      'supprimer_tickets',
      {
        title: 'Supprimer des tickets',
        description:
          'Supprime définitivement les tickets cités ; les US du cadrage restent. Demandez confirmation à l’utilisateur avant d’appeler cet outil.',
        input: { ids: z.array(z.string()).min(1).max(500) },
        write: true,
        destructive: true,
      },
      async a => {
        const r = await ctx.api<{ deleted: string[] }>('POST', '/tickets/suppression', { ids: a.ids });
        return `${r.deleted.length} ticket(s) supprimé(s).`;
      },
    );
}
