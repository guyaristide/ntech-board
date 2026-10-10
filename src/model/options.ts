import type { PvStatus, Priority, QuestionStatus, Scenario, StoryStatus, Version } from './types';

/** Couleurs des étiquettes, reprises de la palette Notion. */
export type Tone = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red';

export const STATUSES: StoryStatus[] = ['À cadrer', 'En atelier', 'À revoir', 'Validée', 'Écartée'];
export const VERSIONS: Version[] = ['MVP', 'V1', 'V2', 'Hors périmètre'];
export const PRIORITIES: Priority[] = ['Must', 'Should', 'Could'];
export const SCENARIOS: Scenario[] = ['nominal', 'alternatif', 'erreur', 'exigence'];
export const QUESTION_STATUSES: QuestionStatus[] = ['Ouvert', 'Tranché', 'Reporté'];
export const PV_STATUSES: PvStatus[] = [
  'À faire',
  'En cours',
  'Diffusé',
  'Validé par Cybastion',
  'En retard',
];

export const TONE: Record<string, Tone> = {
  'À cadrer': 'gray',
  'En atelier': 'blue',
  'À revoir': 'orange',
  Validée: 'green',
  Écartée: 'red',
  MVP: 'purple',
  V1: 'blue',
  V2: 'yellow',
  'Hors périmètre': 'gray',
  Must: 'red',
  Should: 'orange',
  Could: 'gray',
  nominal: 'green',
  alternatif: 'blue',
  erreur: 'red',
  exigence: 'brown',
  Ouvert: 'orange',
  Tranché: 'green',
  Reporté: 'gray',
  'À faire': 'gray',
  'En cours': 'blue',
  Diffusé: 'purple',
  'Validé par Cybastion': 'green',
  'En retard': 'red',
};

export const SCENARIO_LABEL: Record<Scenario, string> = {
  nominal: 'Nominal',
  alternatif: 'Alternatif',
  erreur: 'Erreur',
  exigence: 'Exigence',
};

const PALETTE: Tone[] = ['blue', 'green', 'purple', 'orange', 'pink', 'brown', 'yellow', 'red'];
/** Couleur stable pour une valeur libre (acteur, atelier). */
export const toneOf = (value: string): Tone => {
  if (TONE[value]) return TONE[value];
  let h = 0;
  for (const c of value) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
