import type { Party, ProjectSettings } from './parties';
import type { Diligence, Epic, Phase, Reference, Risk, Story, Workshop } from './types';

/** Rôle d'un membre dans un projet. */
export type Role = 'admin' | 'editor' | 'viewer';
export const ROLES: Role[] = ['admin', 'editor', 'viewer'];
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrateur',
  editor: 'Éditeur',
  viewer: 'Lecteur',
};

export interface ProjectInfo {
  slug: string;
  title: string;
  subtitle: string;
  planning: string | null;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

/** Réponse de GET /api/session. */
export interface SessionInfo {
  project: ProjectInfo;
  user: UserInfo | null;
  role: Role | null;
  /** Administrateur de la plateforme (NTECH SARL) : admin de tous les projets. */
  superadmin: boolean;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
  role: Role;
  invitedAt: string;
  lastLoginAt: string | null;
}

export interface WorkspaceData {
  planning: string | null;
  references: Reference[];
  epics: Epic[];
  stories: Story[];
  workshops: Workshop[];
  phases: Phase[];
  risks: Risk[];
  diligences: Diligence[];
  parties: Party[];
  settings: ProjectSettings;
}

export type EntityKind = 'story' | 'epic' | 'workshop' | 'phase' | 'risk' | 'diligence' | 'party';
export const ENTITY_KINDS: EntityKind[] = ['story', 'epic', 'workshop', 'phase', 'risk', 'diligence', 'party'];
export type EntityOf<K extends EntityKind> = K extends 'story'
  ? Story
  : K extends 'epic'
    ? Epic
    : K extends 'workshop'
      ? Workshop
      : K extends 'phase'
        ? Phase
        : K extends 'risk'
          ? Risk
          : K extends 'diligence'
            ? Diligence
            : Party;

export interface PresenceEntry {
  userId: string;
  name: string;
  email: string;
  path: string;
}

/** Messages poussés par le serveur sur GET /api/events (Server-Sent Events). */
export type ServerEvent =
  | {
      type: 'entity';
      kind: EntityKind;
      id: string;
      data: Story | Epic | Workshop | Phase | Risk | Diligence | Party | null;
      by: string | null;
    }
  | { type: 'presence'; users: PresenceEntry[] }
  | { type: 'reload'; reason: string };

export interface ImportReport {
  added: number;
  updated: number;
  kept: number;
  removed: number;
  details: string[];
}
