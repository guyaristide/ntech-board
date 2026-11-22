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
  /**
   * Hôtes de la console de la plateforme (super-administrateurs), sans projet :
   * « boards.neiba-technologies.com ». « boards.localhost » sert au développement.
   */
  platformHosts: [
    ...list(process.env.PLATFORM_HOST ?? 'boards.neiba-technologies.com').map(h => h.toLowerCase()),
    'boards.localhost',
  ],
  notify: {
    /**
     * Adresse publique d'un projet pour les liens des e-mails, {slug} étant le projet. Vide : le
     * premier modèle de PROJECT_HOSTS, en https. En local : http://localhost:3000.
     */
    origin: process.env.PUBLIC_ORIGIN ?? '',
    /** Temps de calme avant d'envoyer un e-mail « tout de suite » : absorbe les changements en rafale. */
    quietMinutes: Number(process.env.NOTIFY_QUIET_MINUTES ?? 5),
    /** Heure (du serveur) du récapitulatif quotidien et des rappels d'échéance. */
    digestHour: Number(process.env.NOTIFY_DIGEST_HOUR ?? 8),
  },
  /**
   * Notifications système (Web Push) : paire de clés VAPID, à créer une fois avec
   * « npx web-push generate-vapid-keys ». Sans elles, pas de notifications système.
   */
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:contact@neiba-technologies.com',
  },
  /** Cookies « Secure » : auto (selon X-Forwarded-Proto), true ou false. */
  cookieSecure: process.env.COOKIE_SECURE ?? 'auto',
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  loginTokenMinutes: Number(process.env.LOGIN_TOKEN_MINUTES ?? 20),
  storageDir: process.env.STORAGE_DIR ?? './storage',
  /**
   * Clé de chiffrement des secrets enregistrés en base (clés Cloudinary, S3…). Toute chaîne longue
   * et aléatoire (par exemple `openssl rand -base64 32`). Sans elle, seul le stockage local est utilisable.
   */
  secretsKey: process.env.SECRETS_KEY ?? '',
  webDist: process.env.WEB_DIST ?? '',
  /**
   * Analyse des échanges par Claude (écran « À relire »). La clé est propre à chaque projet (Réglages
   * du projet, chiffrée avec SECRETS_KEY) ; le modèle et l'effort se règlent ici pour la plateforme.
   */
  ai: {
    model: process.env.AI_MODEL || 'claude-opus-5-5',
    effort: (process.env.AI_EFFORT || 'medium') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
  },
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? 'NTECH Board <contact@neiba-technologies.com>',
  },
};
