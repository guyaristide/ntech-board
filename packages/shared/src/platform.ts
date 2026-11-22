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
