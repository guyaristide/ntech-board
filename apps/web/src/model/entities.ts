import { withSettingsDefaults, withStoryDefaults, type EntityKind, type Story, type WorkspaceData } from '@board/shared';

/** Contenu d'un tableau vide, et liste du store qui accueille chaque type d'entité. */
export const EMPTY: WorkspaceData = {
  planning: null,
  references: [],
  epics: [],
  stories: [],
  workshops: [],
  phases: [],
  risks: [],
  diligences: [],
  parties: [],
  settings: withSettingsDefaults(null),
};
export const KEY: Record<
  EntityKind,
  'stories' | 'epics' | 'workshops' | 'phases' | 'risks' | 'diligences' | 'parties'
> = {
  story: 'stories',
  epic: 'epics',
  workshop: 'workshops',
  phase: 'phases',
  risk: 'risks',
  diligence: 'diligences',
  party: 'parties',
};

/** Contenu reçu du serveur, complété des champs apparus depuis (US enregistrées avant le 17/10/2026). */
export const normalize = (kind: EntityKind, data: unknown) =>
  kind === 'story' && data ? withStoryDefaults(data as Story) : data;

