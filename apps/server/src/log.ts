import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth';

/**
 * Journal lisible dans les logs Coolify : une ligne par événement, horodatée, préfixée par sa catégorie.
 *   2026-10-10T14:02:11.120Z [http] POST /api/auth/login 200 34 ms · etourisme · anonyme · 41.202.x.x
 */
const stamp = () => new Date().toISOString();
export const log = (category: string, message: string) => console.log(`${stamp()} [${category}] ${message}`);
export const warn = (category: string, message: string) =>
  console.warn(`${stamp()} [${category}] ${message}`);
export const fail = (category: string, message: string, error?: unknown) =>
  console.error(
    `${stamp()} [${category}] ${message}${error instanceof Error ? `\n${error.stack ?? error.message}` : ''}`,
  );

/** Adresse IP du client, derrière le proxy de Coolify. */
export const clientIp = (h: (name: string) => string | undefined) =>
  h('x-forwarded-for')?.split(',')[0].trim() || h('x-real-ip') || '?';

// Requêtes trop fréquentes pour être utiles dans le journal.
const QUIET = new Set(['/api/health', '/api/presence']);

/** Une ligne par requête API : méthode, chemin, statut, durée, projet, utilisateur, IP. */
export const accessLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = performance.now();
  await next();
  const path = new URL(c.req.url).pathname;
  if (QUIET.has(path) && c.res.status < 400) return;
  if (path === '/api/events') return; // flux temps réel : journalisé à l'ouverture et à la fermeture
  const project = c.get('project')?.slug ?? '-';
  const user = c.get('user')?.email ?? 'anonyme';
  const ms = Math.round(performance.now() - started);
  const line = `${c.req.method} ${path} ${c.res.status} ${ms} ms · ${project} · ${user} · ${clientIp(n => c.req.header(n))}`;
  if (c.res.status >= 500) fail('http', line);
  else if (c.res.status >= 400) warn('http', line);
  else log('http', line);
};
