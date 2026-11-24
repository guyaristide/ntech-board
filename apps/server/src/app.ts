import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { context, guardTokenDeletions, isPlatformHost, sameOrigin, type AppEnv } from './auth';
import { pool } from './db';
import { env } from './env';
import { accessLog, fail } from './log';
import { mcpRoutes } from './mcp';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { governanceRoutes } from './routes/governance';
import { deliveryRoutes } from './routes/delivery';
import { labelRoutes } from './routes/labels';
import { findingRoutes } from './routes/findings';
import { flowRoutes } from './routes/flow';
import { slackRoutes } from './routes/slack';
import { sprintPlanRoutes } from './routes/sprintPlan';
import { fileRoutes } from './routes/files';
import { partyRoutes } from './routes/parties';
import { recetteRoutes } from './routes/recette';
import { tokenRoutes } from './routes/tokens';
import { aiRoutes } from './routes/ai';
import { threadRoutes } from './routes/threads';
import { notificationRoutes } from './routes/notifications';
import { sourceRoutes } from './routes/sources';
import { pdfRoutes } from './routes/pdf';
import { programmeRoutes } from './routes/programme';
import { workspaceRoutes } from './routes/workspace';
import { findProject, projectSlug } from './tenancy';
import { platformApi } from './routes/platform';

const here = dirname(fileURLToPath(import.meta.url));
/** Front construit (apps/web/dist), servi par le même processus en production. */
const webDist = env.webDist ? resolve(env.webDist) : resolve(here, '../../web/dist');

export function createApp() {
  const app = new Hono<AppEnv>();

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        // blob: aperçu local d'une capture avant son envoi.
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  // Sonde de santé (Docker, Coolify) : ne dépend d'aucun projet.
  app.get('/api/health', async c => {
    await pool.query('SELECT 1');
    return c.json({ ok: true });
  });

  // Journal de toutes les requêtes /api, y compris les routes inconnues.
  app.use('/api/*', accessLog);

  // Hôte de la console (boards.…) : sans projet, il a ses propres routes, réservées aux super-administrateurs.
  app.use('/api/*', async (c, next) => {
    if (!isPlatformHost(c.req.header('x-forwarded-host') ?? c.req.header('host'))) return next();
    return platformApi.fetch(c.req.raw);
  });

  const api = new Hono<AppEnv>();
  api.use('*', context, sameOrigin, guardTokenDeletions);
  api.onError((err, c) => {
    fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
    return c.json({ error: 'server_error' }, 500);
  });
  api.route('/', authRoutes);
  api.route('/', workspaceRoutes);
  api.route('/', governanceRoutes);
  api.route('/', programmeRoutes);
  api.route('/', pdfRoutes);
  api.route('/', partyRoutes);
  api.route('/', deliveryRoutes);
  api.route('/', labelRoutes);
  api.route('/', sprintPlanRoutes);
  api.route('/', flowRoutes);
  api.route('/', fileRoutes);
  api.route('/', recetteRoutes);
  api.route('/', findingRoutes);
  api.route('/', tokenRoutes);
  api.route('/', sourceRoutes);
  api.route('/', aiRoutes);
  api.route('/', threadRoutes);
  api.route('/', notificationRoutes);
  // Le serveur MCP rappelle l'API du tableau (mêmes contrôles), sans repasser par le réseau.
  api.route(
    '/',
    mcpRoutes(req => Promise.resolve(app.fetch(req))),
  );
  api.route(
    '/',
    slackRoutes(req => Promise.resolve(app.fetch(req))),
  );
  api.route('/admin', adminRoutes);
  api.notFound(c => c.json({ error: 'not_found' }, 404));
  app.route('/api', api);
  // Une route d'API inconnue répond en JSON, jamais par la page du front.
  app.all('/api/*', c => c.json({ error: 'not_found' }, 404));

  if (existsSync(webDist)) {
    const index = readFileSync(join(webDist, 'index.html'), 'utf8');
    app.use('/assets/*', serveStatic({ root: relative(process.cwd(), webDist) }));
    app.use('/brand/*', serveStatic({ root: relative(process.cwd(), webDist) }));
    // Service worker : toujours revérifié, pour qu'une nouvelle version s'installe sans attendre.
    const worker = readFileSync(join(webDist, 'sw.js'), 'utf8');
    app.get('/sw.js', c =>
      c.body(worker, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }),
    );
    // Manifeste de l'application installable : au nom du projet servi sur cet hôte.
    app.get('/manifest.webmanifest', async c => {
      const slug = projectSlug(c.req.header('x-forwarded-host') ?? c.req.header('host'));
      const project = slug ? await findProject(slug) : null;
      const name = project?.title ?? 'NTECH Board';
      return c.body(
        JSON.stringify({
          name: project ? `${name} · NTECH Board` : name,
          short_name: name.slice(0, 24),
          description: 'Cadrage, backlog, sprints et suivi de projet.',
          lang: 'fr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#ffffff',
          icons: [
            { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        }),
        200,
        { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache' },
      );
    });
    // Application monopage : toute autre URL renvoie index.html.
    app.get('*', c => c.html(index));
  }
  return app;
}
