import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Role, WorkspaceData } from '@board/shared';
import type { z } from 'zod';

/**
 * Contexte d'un appel MCP : le membre (par son jeton), et l'accès à l'API du tableau sous son
 * identité. Les outils passent par les mêmes routes que l'interface : mêmes contrôles, même
 * journal, mêmes notifications temps réel.
 */
export interface Ctx {
  user: { id: string; name: string; email: string };
  role: Role;
  project: { title: string; slug: string };
  /** Appelle l'API du tableau ; lève une erreur lisible si la requête échoue. */
  api: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;
  /** Contenu du tableau tel que le membre le voit (Réalisation vide s'il ne la voit pas). */
  workspace: () => Promise<WorkspaceData>;
  /** Le membre voit la partie Réalisation. */
  delivery: boolean;
}

export const MESSAGES: Record<string, string> = {
  unauthenticated: 'Jeton absent, invalide ou expiré.',
  forbidden: 'Votre rôle ne permet pas cette action.',
  delivery_hidden: 'La partie Réalisation n’est pas ouverte à votre profil.',
  not_found: 'Élément introuvable.',
  invalid: 'Valeurs refusées par le tableau.',
};

export class ApiFailure extends Error {}

type Shape = z.ZodRawShape;
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean };

/**
 * Déclare un outil : la réponse est un texte (Markdown) ; une erreur de l'API devient un message
 * d'erreur lisible plutôt qu'une exception.
 */
export function tool<S extends Shape>(
  server: McpServer,
  name: string,
  config: { title: string; description: string; input?: S; write?: boolean },
  run: (args: z.infer<z.ZodObject<S>>) => Promise<string>,
) {
  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.input ?? {},
      annotations: config.write
        ? { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
        : { readOnlyHint: true, openWorldHint: false },
    },
    (async (args: never): Promise<Result> => {
      try {
        return { content: [{ type: 'text', text: await run(args) }] };
      } catch (err) {
        const message =
          err instanceof ApiFailure ? err.message : `Erreur inattendue : ${(err as Error).message}`;
        return { content: [{ type: 'text', text: message }], isError: true };
      }
    }) as never,
  );
}

/** Texte : lignes non vides jointes. */
export const lines = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(p => p !== false && p != null).join('\n');
export const list = <T>(items: T[], line: (x: T) => string, empty = 'Aucun résultat.') =>
  items.length ? items.map(line).join('\n') : empty;
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Recherche souple : sans accents ni casse, tous les mots présents. */
export const matches = (query: string | undefined, ...fields: (string | undefined)[]) => {
  if (!query) return true;
  const hay = norm(fields.filter(Boolean).join(' '));
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .every(w => hay.includes(w));
};
/** Identifiant ou libellé : « done », « Terminé », « terminé ». */
export const pick = <T extends { id: string; name: string }>(items: T[], value: string) =>
  items.find(x => x.id === value) ?? items.find(x => norm(x.name) === norm(value));
