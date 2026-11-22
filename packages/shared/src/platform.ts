/** Console de la plateforme : vue d'ensemble des projets, comptes, super-administrateurs, état. */

export interface PlatformProject {
  slug: string;
  title: string;
  subtitle: string;
  /** Adresse publique du tableau. */
  url: string;
  createdAt: string;
  members: number;
  admins: string[];
  stories: number;
  tickets: number;
  /** Fichiers joints : nombre et taille totale en octets. */
  files: number;
  bytes: number;
  /** Dernière modification enregistrée dans le projet. */
  lastActivity: string | null;
  delivery: boolean;
  aiKey: boolean;
}

export interface PlatformHealth {
  mail: boolean;
  push: boolean;
  secrets: boolean;
  /** Révision déployée (variable SOURCE_COMMIT de Coolify), si connue. */
  version: string;
  node: string;
  startedAt: string;
  databaseBytes: number;
  hosts: string[];
}

export interface PlatformOverview {
  projects: PlatformProject[];
  health: PlatformHealth;
  users: number;
}

export interface PlatformUser {
  userId: string;
  email: string;
  name: string;
  lastLoginAt: string | null;
  superadmin: boolean;
  projects: { slug: string; title: string; role: string }[];
}

export interface PlatformAdmin {
  email: string;
  /** Désigné par SUPERADMIN_EMAILS : ne se retire pas depuis la console. */
  locked: boolean;
  addedBy: string;
  addedAt: string | null;
}

/** Adresse d'un projet : minuscules, chiffres et tirets, comme un sous-domaine. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** Fiche détaillée d'un projet, pour sa page dans la console. */
export interface PlatformProjectDetail {
  project: PlatformProject;
  /** Nombre d'éléments par type (story, ticket, risk…). */
  counts: Record<string, number>;
  /** Modifications par jour sur les 30 derniers jours (jours sans activité absents). */
  activity: { day: string; n: number }[];
  /** Qui a le plus modifié le projet sur 30 jours. */
  contributors: { name: string; email: string; n: number }[];
  online: { tabs: number; users: { name: string; email: string }[] };
  sessions: PlatformSession[];
  tokens: PlatformToken[];
  settings: {
    delivery: boolean;
    ticketKey: string;
    estimation: string;
    sprintWeeks: number;
    workflow: string[];
    ticketTypes: string[];
    versions: string[];
    actors: string[];
    referenceDocument: string;
    riskScopes: string[];
    mcpRoles: string[];
    mcpDeletions: boolean;
    fileStore: string;
    fileMaxMb: number;
    fileCategories: string[];
  };
  storage: { store: string; files: number; bytes: number }[];
  backends: { name: string; provider: string }[];
  aiKey: { configured: boolean; hint: string; updatedBy: string; updatedAt: string | null };
  notifications: { total: number; unread: number; unsent: number; devices: number; followers: number };
}

export interface PlatformSession {
  /** Empreinte abrégée de la session : sert à la fermer. */
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface PlatformToken {
  id: string;
  name: string;
  prefix: string;
  email: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface PlatformEvent {
  at: string;
  kind: string;
  entityId: string;
  action: string;
  by: string;
}

export interface PlatformAudit {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

/** État détaillé de la plateforme : services, exécution, configuration, base, activité, files d'attente. */
export interface PlatformStatus {
  services: {
    mail: { configured: boolean; host: string; port: number; secure: boolean; user: string; from: string };
    push: { enabled: boolean; publicKey: string; subject: string; devices: number };
    secrets: boolean;
    ai: { model: string; effort: string; projectsWithKey: number };
    storage: { root: string; stores: { store: string; files: number; bytes: number }[]; backends: number };
  };
  runtime: {
    version: string;
    node: string;
    platform: string;
    pid: number;
    startedAt: string;
    uptimeSeconds: number;
    memoryRss: number;
    memoryHeap: number;
    timezone: string;
    now: string;
  };
  config: { key: string; value: string }[];
  database: {
    version: string;
    bytes: number;
    pool: { total: number; idle: number; waiting: number };
    tables: { name: string; rows: number; bytes: number }[];
    migrations: { name: string; appliedAt: string }[];
    entities: { kind: string; n: number }[];
  };
  activity: {
    events24h: number;
    events7d: number;
    activeUsers7d: number;
    logins7d: number;
    sessionsProjects: number;
    sessionsConsole: number;
    onlineTabs: number;
    onlineUsers: number;
  };
  queues: {
    mailPending: number;
    notificationsUnread: number;
    loginLinksValid: number;
    jobs: { name: string; ranOn: string }[];
  };
}
