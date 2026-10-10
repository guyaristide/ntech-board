/** Reconnaissance du projet d'après l'hôte, sans dépendance (testée dans test/tenancy.test.ts). */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Transforme « {slug}-board.neiba-technologies.com » en expression qui capture le slug. */
export const hostPatterns = (patterns: string[]) =>
  patterns.map(p => new RegExp(`^${escape(p).replace('\\{slug\\}', '([a-z0-9][a-z0-9-]*)')}$`, 'i'));

/** Slug du projet d'après l'hôte de la requête (port ignoré), sinon le projet par défaut. */
export function slugFromHost(host: string | undefined, patterns: RegExp[], fallback: string) {
  const name = (host ?? '').split(':')[0].toLowerCase();
  for (const re of patterns) {
    const m = re.exec(name);
    if (m) return m[1];
  }
  return fallback || null;
}
