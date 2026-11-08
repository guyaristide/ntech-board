import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PARTY_TYPES } from '@board/shared';
import { z } from 'zod';
import { ReleasePatch, SprintPatch } from '../routes/deliverySchemas';
import { Code, EpicPatch, ReferencePatch, WorkshopPatch } from '../routes/programmeSchemas';
import { CampaignPatch } from '../routes/recette';
import { DiligencePatch, PartyPatch, PhasePatch, RiskPatch } from '../routes/schemas';
import { tool, type Ctx } from './context';

/**
 * Outils creer_x, modifier_x et supprimer_x de chaque type d'élément, déclarés d'après les schémas
 * de l'API : mêmes champs et mêmes règles que l'interface, sans les recopier ici.
 */
type Fields = Record<string, unknown>;
interface Entity {
  name: string;
  label: string;
  path: string;
  schema: z.ZodObject;
  delivery?: boolean;
  /** Champs propres à la création, et corps de la requête de création. */
  extra?: z.ZodRawShape;
  body?: (fields: Fields, extra: Fields) => unknown;
}

const code = { code: Code.optional().describe('Identifiant choisi (UC16, J10) ; attribué sinon') };
const coded = (fields: Fields, extra: Fields) => ({
  ...(extra.code ? { id: extra.code } : {}),
  patch: fields,
});

const ENTITIES: Entity[] = [
  { name: 'epique', label: 'Épique', path: '/epics', schema: EpicPatch, extra: code, body: coded },
  { name: 'atelier', label: 'Atelier', path: '/workshops', schema: WorkshopPatch, extra: code, body: coded },
  { name: 'reference', label: 'Référence', path: '/references', schema: ReferencePatch },
  {
    name: 'phase',
    label: 'Phase',
    path: '/phases',
    schema: PhasePatch,
    extra: {
      copie_de: z.string().max(40).optional().describe('Phase dont reprendre acteurs et matrice RACI'),
    },
  },
  {
    name: 'risque',
    label: 'Risque',
    path: '/risks',
    schema: RiskPatch,
    extra: { prefixe: z.string().default('R').describe('Préfixe du périmètre de risque (R, RG-…)') },
    body: (fields, extra) => ({ prefix: extra.prefixe, patch: fields }),
  },
  { name: 'diligence', label: 'Diligence', path: '/diligences', schema: DiligencePatch },
  {
    name: 'partie_prenante',
    label: 'Partie prenante',
    path: '/parties',
    schema: PartyPatch,
    extra: { genre: z.enum(PARTY_TYPES).describe('Organisation, personne ou rôle') },
    body: (fields, extra) => ({ type: extra.genre, patch: fields }),
  },
  { name: 'version', label: 'Version', path: '/releases', schema: ReleasePatch, delivery: true },
  { name: 'sprint', label: 'Sprint', path: '/sprints', schema: SprintPatch, delivery: true },
  {
    name: 'campagne',
    label: 'Campagne de recette',
    path: '/campaigns',
    schema: CampaignPatch,
    delivery: true,
  },
];

const at = (e: Entity, id: string) => `${e.path}/${encodeURIComponent(id)}`;

function register(server: McpServer, ctx: Ctx, e: Entity) {
  const extraKeys = Object.keys(e.extra ?? {});
  tool(
    server,
    `creer_${e.name}`,
    {
      title: `Créer : ${e.label}`,
      description: `Crée un élément « ${e.label} ». Tous les champs sont facultatifs sauf indication ; la réponse donne son identifiant.`,
      input: { ...e.schema.shape, ...e.extra },
      write: true,
    },
    async a => {
      const all = a as Fields;
      const fields = Object.fromEntries(Object.entries(all).filter(([k]) => !extraKeys.includes(k)));
      const extra = Object.fromEntries(Object.entries(all).filter(([k]) => extraKeys.includes(k)));
      if (e.name === 'phase') {
        // La route crée la phase d'après son titre ; le reste se pose ensuite.
        const { title, ...rest } = fields;
        if (typeof title !== 'string' || !title.trim()) return 'Indiquez le titre (title) de la phase.';
        const phase = await ctx.api<{ id: string }>('POST', e.path, { title, copyFrom: extra.copie_de });
        if (Object.keys(rest).length) await ctx.api('PATCH', at(e, phase.id), rest);
        return `${e.label} créée : ${phase.id}.`;
      }
      const made = await ctx.api<{ id: string }>(
        'POST',
        e.path,
        e.body ? e.body(fields, extra) : { patch: fields },
      );
      return `${e.label} créé(e) : ${made.id}.`;
    },
  );
  tool(
    server,
    `modifier_${e.name}`,
    {
      title: `Modifier : ${e.label}`,
      description: `Modifie un élément « ${e.label} ». Seuls les champs fournis changent.`,
      input: { id: z.string(), ...e.schema.shape },
      write: true,
    },
    async a => {
      const { id, ...patch } = a as Fields & { id: string };
      if (!Object.keys(patch).length) return 'Aucun champ à modifier.';
      await ctx.api('PATCH', at(e, id), patch);
      return `${e.label} ${id} modifié(e) : ${Object.keys(patch).join(', ')}.`;
    },
  );
  if (ctx.deletions)
    tool(
      server,
      `supprimer_${e.name}`,
      {
        title: `Supprimer : ${e.label}`,
        description: `Supprime définitivement un élément « ${e.label} ». Demandez confirmation à l’utilisateur avant d’appeler cet outil.`,
        input: { id: z.string() },
        write: true,
        destructive: true,
      },
      async a => {
        await ctx.api('DELETE', at(e, a.id));
        return `${e.label} ${a.id} supprimé(e).`;
      },
    );
}

export function registerEntities(server: McpServer, ctx: Ctx) {
  for (const e of ENTITIES) if (!e.delivery || ctx.delivery) register(server, ctx, e);
}
