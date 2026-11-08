import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import type { WorkspaceData } from '@board/shared';
import { seesDelivery } from '../access';
import type { AppEnv } from '../auth';
import { getSettings } from '../repo';
import { registerActions, registerDeliveryActions } from './actions';
import { registerAdmin } from './admin';
import { registerBatch } from './batch';
import { ApiFailure, MESSAGES, type Ctx } from './context';
import { registerDelivery } from './delivery';
import { registerEntities } from './entities';
import { registerRead } from './read';
import { registerDeliveryWrite, registerWrite } from './write';

/**
 * Serveur MCP du tableau (`/api/mcp`, transport HTTP « streamable », sans état) : un assistant
 * (Claude Code, Claude Desktop, Cursor…) consulte et modifie le projet avec le jeton personnel d'un
 * membre, dans les limites de son rôle. Chaque requête construit son serveur : la liste des outils
 * dépend du rôle et de l'accès à la partie Réalisation.
 */
const INSTRUCTIONS = `Tableau de cadrage et de réalisation d'un projet : backlog de user stories (US) rangées en épiques,
programme d'ateliers avec leurs points à trancher, risques, diligences, parties prenantes et, si votre profil y a
accès, la partie Réalisation (tickets, sprints, versions, recette, pilotage). Commencez par l'outil « projet ».
Les écritures sont signées du nom du membre propriétaire du jeton et visibles en temps réel par l'équipe.
Pour construire beaucoup d'éléments d'un coup, utilisez « executer_lot » (avec simuler=true d'abord) ou, pour un
administrateur, « importer_donnees ». Demandez confirmation avant toute suppression ou invitation.`;

export function mcpRoutes(fetchApi: (req: Request) => Promise<Response>) {
  const routes = new Hono<AppEnv>();

  routes.post('/mcp', async c => {
    const user = c.get('user');
    const role = c.get('role');
    if (!user || !role || !c.get('apiToken'))
      return c.json(
        {
          error: 'unauthenticated',
          message: 'Jeton personnel requis : en-tête « Authorization: Bearer brd_… ».',
        },
        401,
        {
          'WWW-Authenticate': 'Bearer realm="ntech-board"',
        },
      );
    const project = c.get('project');
    const headers = new Headers();
    for (const h of ['authorization', 'host', 'x-forwarded-host', 'x-forwarded-proto']) {
      const v = c.req.header(h);
      if (v) headers.set(h, v);
    }
    const api: Ctx['api'] = async (method, path, body) => {
      const h = new Headers(headers);
      const form = body instanceof FormData;
      if (body !== undefined && !form) h.set('content-type', 'application/json');
      // Une écriture périme le contenu lu : un lot relit ce qu'il vient de créer.
      if (method !== 'GET') cache = null;
      const res = await fetchApi(
        new Request(new URL(`/api${path}`, c.req.url), {
          method,
          headers: h,
          body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
        }),
      );
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      if (!res.ok)
        throw new ApiFailure(
          data?.message ?? MESSAGES[data?.error] ?? `Refusé par le tableau (${res.status}).`,
        );
      return data;
    };
    let cache: Promise<WorkspaceData> | null = null;
    const settings = await getSettings(project.id);
    const ctx: Ctx = {
      user,
      role,
      project: { title: project.title, slug: project.slug },
      api,
      workspace: () => (cache ??= api<WorkspaceData>('GET', '/workspace')),
      delivery: await seesDelivery(project.id, role, user.id),
      deletions: role !== 'viewer' && settings.mcp.deletions,
    };

    const server = new McpServer(
      { name: 'ntech-board', title: `NTECH Board · ${project.title}`, version: '1.0.0' },
      { instructions: INSTRUCTIONS },
    );
    registerRead(server, ctx);
    if (ctx.delivery) registerDelivery(server, ctx);
    if (role !== 'viewer') registerWrite(server, ctx);
    if (ctx.delivery) registerDeliveryWrite(server, ctx, role !== 'viewer');
    if (role !== 'viewer') {
      registerEntities(server, ctx);
      registerActions(server, ctx);
      if (ctx.delivery) registerDeliveryActions(server, ctx);
    }
    if (role === 'admin') registerAdmin(server, ctx);
    registerBatch(server);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      void server.close();
    }
  });

  // Sans état : pas de flux d'événements ni de session à fermer.
  routes.on(['GET', 'DELETE'], '/mcp', c => c.json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' }));
  return routes;
}
