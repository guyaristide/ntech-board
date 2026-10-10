import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { context, sameOrigin, type AppEnv } from './auth';
import { pool } from './db';
import { env } from './env';
import { accessLog, fail } from './log';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { workspaceRoutes } from './routes/workspace';

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
        imgSrc: ["'self'", 'data:'],
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

  const api = new Hono<AppEnv>();
  api.use('*', accessLog, context, sameOrigin);
  api.onError((err, c) => {
    fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
    return c.json({ error: 'server_error' }, 500);
  });
  api.route('/', authRoutes);
  api.route('/', workspaceRoutes);
  api.route('/admin', adminRoutes);
  api.notFound(c => c.json({ error: 'not_found' }, 404));
  app.route('/api', api);

  if (existsSync(webDist)) {
    const index = readFileSync(join(webDist, 'index.html'), 'utf8');
    app.use('/assets/*', serveStatic({ root: relative(process.cwd(), webDist) }));
    app.use('/brand/*', serveStatic({ root: relative(process.cwd(), webDist) }));
    // Application monopage : toute autre URL renvoie index.html.
    app.get('*', c => c.html(index));
  }
  return app;
}
