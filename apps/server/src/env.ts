/** Configuration lue dans l'environnement (voir .env.example et docs/DEPLOIEMENT.md). */
const list = (v: string | undefined) =>
  (v ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/** Connexion : DATABASE_URL, ou à défaut les variables standard PGHOST, PGUSER, PGPASSWORD, PGDATABASE. */
const databaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.PGHOST) return undefined;
  throw new Error('Configurez DATABASE_URL ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE.');
};

const DEFAULT_HOSTS = ['{slug}-board.neiba-technologies.com', '{slug}-board.localhost'];

function projectHosts(value: string | undefined) {
  const all = list(value);
  const valid = all.filter(p => p.includes('{slug}'));
  for (const p of all.filter(p => !p.includes('{slug}')))
    console.warn(
      `PROJECT_HOSTS : « ${p} » ignoré, il doit contenir {slug} (exemple : {slug}-board.neiba-technologies.com).`,
    );
  return valid.length ? valid : DEFAULT_HOSTS;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: databaseUrl(),
  /**
   * Modèles d'hôte, {slug} étant le projet : « {slug}-board.neiba-technologies.com ».
   * Vide ou absent : modèle par défaut. Un modèle sans {slug} est ignoré (avertissement au démarrage).
   */
  projectHosts: projectHosts(process.env.PROJECT_HOSTS),
  /** Projet servi quand l'hôte ne correspond à aucun modèle (instance dédiée, développement). */
  defaultProject: process.env.DEFAULT_PROJECT ?? '',
  superadmins: list(process.env.SUPERADMIN_EMAILS).map(e => e.toLowerCase()),
  /** Cookies « Secure » : auto (selon X-Forwarded-Proto), true ou false. */
  cookieSecure: process.env.COOKIE_SECURE ?? 'auto',
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  loginTokenMinutes: Number(process.env.LOGIN_TOKEN_MINUTES ?? 20),
  storageDir: process.env.STORAGE_DIR ?? './storage',
  webDist: process.env.WEB_DIST ?? '',
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'NTECH Board <contact@neiba-technologies.com>',
  },
};
