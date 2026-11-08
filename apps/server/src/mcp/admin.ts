import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ROLES, type ImportReport } from '@board/shared';
import { z } from 'zod';
import { SettingsPatch } from '../routes/schemas';
import { ApiFailure, lines, list, tool, type Ctx } from './context';

/**
 * Outils des administrateurs : réglages, membres, imports. L'accès MCP lui-même et les jetons restent
 * hors de portée : ils ne se règlent qu'à l'écran, par une personne.
 */
const { mcp: _mcp, ...settingsFields } = SettingsPatch.shape;

/** Formats d'import, donnés à l'assistant qui prépare les données. */
const FORMATS = `Quoi importer :
- backlog : { epics: [{ id, title, summary, workshops, version, source, toFrame }], stories: [{ id, epic, title, actor, asA, iWant, soThat, acceptance: [texte], scenario, source, version, workshop, priority, targets?, links?, description? }] } ;
- cadrage : { parties?: [], diligences?: [], stories?: [{ id, description?, targets?, links? }] } ;
- raci : { source, phases: [] } ou classeur .xlsx ;
- risques : { source, risks: [] } ou classeur .xlsx ;
- planning : classeur .xlsx seulement.
Les éléments nouveaux sont ajoutés, ceux jamais modifiés dans l'outil sont remplacés, ceux modifiés sont conservés.`;
const IMPORT_PATH = {
  backlog: '/admin/import/stories',
  cadrage: '/admin/import/cadrage',
  raci: '/admin/import/raci',
  risques: '/admin/import/risks',
  planning: '/admin/import/planning',
} as const;

interface Member {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export function registerAdmin(server: McpServer, ctx: Ctx) {
  tool(
    server,
    'importer_donnees',
    {
      title: 'Importer des données en masse',
      description: `Importe d'un coup, comme l'écran Membres et imports. ${FORMATS} Fournir « donnees » (JSON) ou « xlsx_base64 ».`,
      input: {
        quoi: z.enum(['backlog', 'cadrage', 'raci', 'risques', 'planning']),
        donnees: z.record(z.string(), z.unknown()).optional(),
        xlsx_base64: z.string().optional(),
        nom_fichier: z.string().max(120).optional(),
      },
      write: true,
    },
    async a => {
      if (!a.donnees === !a.xlsx_base64) throw new ApiFailure('Fournissez « donnees » ou « xlsx_base64 ».');
      const file = a.donnees
        ? new File([JSON.stringify(a.donnees)], a.nom_fichier ?? `${a.quoi}-mcp.json`)
        : new File([Buffer.from(a.xlsx_base64!, 'base64')], a.nom_fichier ?? `${a.quoi}-mcp.xlsx`);
      const form = new FormData();
      form.append('file', file);
      const r = await ctx.api<ImportReport>('POST', IMPORT_PATH[a.quoi], form);
      return lines(
        `Import ${a.quoi} : ${r.added} ajouté(s), ${r.updated} mis à jour, ${r.kept} conservé(s), ${r.removed} retiré(s).`,
        ...(r.details ?? []),
      );
    },
  );

  tool(
    server,
    'modifier_reglages',
    {
      title: 'Modifier les réglages du projet',
      description:
        'Versions, acteurs, document de référence, périmètres de risque, Réalisation (activation, workflow, types de tickets…), fichiers. Chaque partie envoyée remplace la précédente : lisez d’abord l’outil « reglages ». L’accès MCP ne se règle qu’à l’écran.',
      input: settingsFields,
      write: true,
    },
    async patch => {
      if (!Object.keys(patch).length) return 'Aucun réglage à modifier.';
      await ctx.api('PATCH', '/settings', patch);
      return `Réglages modifiés : ${Object.keys(patch).join(', ')}.`;
    },
  );
  tool(
    server,
    'copier_reglages',
    {
      title: 'Reprendre les réglages d’un autre projet',
      description:
        'Remplace les réglages du projet par ceux d’un autre projet que vous administrez (sans son contenu).',
      input: { projet: z.string().max(60).describe('Identifiant du projet source (etourisme…)') },
      write: true,
    },
    async a => {
      await ctx.api('POST', '/admin/settings/copy', { from: a.projet });
      return `Réglages repris de ${a.projet}.`;
    },
  );
  tool(
    server,
    'modifier_projet',
    {
      title: 'Modifier le titre du projet',
      description: 'Change le titre ou le sous-titre du projet.',
      input: {
        titre: z.string().trim().min(1).max(120).optional(),
        sous_titre: z.string().trim().max(300).optional(),
      },
      write: true,
    },
    async a => {
      await ctx.api('PATCH', '/admin/project', {
        ...(a.titre ? { title: a.titre } : {}),
        ...(a.sous_titre !== undefined ? { subtitle: a.sous_titre } : {}),
      });
      return 'Projet modifié.';
    },
  );

  tool(
    server,
    'membres',
    { title: 'Lister les membres', description: 'Membres du projet, avec leur rôle.' },
    async () =>
      list(
        await ctx.api<Member[]>('GET', '/admin/members'),
        m => `- ${m.name || m.email} · ${m.email} · ${m.role} · ${m.userId}`,
      ),
  );
  tool(
    server,
    'inviter_membre',
    {
      title: 'Inviter un membre',
      description:
        'Ajoute un membre avec son rôle. Par défaut, il reçoit un e-mail d’invitation : confirmez avec l’utilisateur avant d’appeler cet outil.',
      input: {
        email: z.email().max(200),
        nom: z.string().trim().max(80).default(''),
        role: z.enum(ROLES),
        notifier: z.boolean().default(true),
      },
      write: true,
    },
    async a => {
      await ctx.api('POST', '/admin/members', {
        email: a.email,
        name: a.nom,
        role: a.role,
        notify: a.notifier,
      });
      return `${a.email} ajouté(e) comme ${a.role}${a.notifier ? ', invitation envoyée' : ''}.`;
    },
  );
  tool(
    server,
    'changer_role_membre',
    {
      title: 'Changer le rôle d’un membre',
      description: 'Change le rôle d’un membre (identifiant donné par l’outil membres).',
      input: { membre: z.string(), role: z.enum(ROLES) },
      write: true,
    },
    async a => {
      await ctx.api('PATCH', `/admin/members/${encodeURIComponent(a.membre)}`, { role: a.role });
      return `Rôle changé : ${a.role}.`;
    },
  );
  if (ctx.deletions)
    tool(
      server,
      'retirer_membre',
      {
        title: 'Retirer un membre',
        description:
          'Retire un membre du projet et ferme ses sessions. Demandez confirmation à l’utilisateur avant d’appeler cet outil.',
        input: { membre: z.string() },
        write: true,
        destructive: true,
      },
      async a => {
        await ctx.api('DELETE', `/admin/members/${encodeURIComponent(a.membre)}`);
        return 'Membre retiré.';
      },
    );
}
