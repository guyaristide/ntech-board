import type {
  ActionNature,
  ActionStatus,
  Cotation,
  DiligenceKind,
  DiligenceStatus,
  LinkType,
  PhaseStatus,
  PvStatus,
  Priority,
  QuestionStatus,
  RaciActor,
  RaciRow,
  RaciValue,
  RiskLevel,
  RiskStatus,
  RiskValidation,
  Scenario,
  StoryStatus,
  Version,
} from './types';

/** Couleurs des étiquettes, reprises de la palette Notion. */
export type Tone = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red';

export const STATUSES = [
  'À cadrer',
  'En atelier',
  'À revoir',
  'Validée',
  'Écartée',
] as const satisfies readonly StoryStatus[];
export const VERSIONS = ['MVP', 'V1', 'V2', 'Hors périmètre'] as const satisfies readonly Version[];
export const PRIORITIES = ['Must', 'Should', 'Could'] as const satisfies readonly Priority[];
export const SCENARIOS = [
  'nominal',
  'alternatif',
  'erreur',
  'exigence',
] as const satisfies readonly Scenario[];
export const QUESTION_STATUSES = [
  'Ouvert',
  'Tranché',
  'Reporté',
] as const satisfies readonly QuestionStatus[];
export const PV_STATUSES = [
  'À faire',
  'En cours',
  'Diffusé',
  'Validé',
  'En retard',
] as const satisfies readonly PvStatus[];

/** Statut de PV lu dans un planning (« Validé par Cybastion » devient « Validé »). */
export const normalizePvStatus = (value: string): PvStatus =>
  value.startsWith('Validé')
    ? 'Validé'
    : (((PV_STATUSES as readonly string[]).includes(value) ? value : 'À faire') as PvStatus);

export const PHASE_STATUSES = ['À venir', 'En cours', 'Terminée'] as const satisfies readonly PhaseStatus[];
export const RACI_VALUES = ['R', 'A', 'A/R', 'C', 'I'] as const satisfies readonly RaciValue[];
export const RACI_LABEL: Record<Exclude<RaciValue, ''>, string> = {
  R: 'Réalise',
  A: 'Approuve',
  'A/R': 'Approuve et réalise',
  C: 'Consulté',
  I: 'Informé',
};

/** Contrôle d'une ligne RACI : un seul A (« A/R » compris) et au moins un R. */
export const raciCheck = (row: RaciRow, actors: RaciActor[]) => {
  const values = actors.map(a => row.cells[a.id] ?? '');
  const a = values.filter(v => v === 'A' || v === 'A/R').length;
  const r = values.filter(v => v === 'R' || v === 'A/R').length;
  const problems = [...(a === 0 ? ['aucun A'] : a > 1 ? [`${a} A`] : []), ...(r === 0 ? ['aucun R'] : [])];
  return { ok: !problems.length, problems };
};

export const RISK_LEVELS = ['Faible', 'Modéré', 'Élevé', 'Critique'] as const satisfies readonly RiskLevel[];
export const RISK_STATUSES = [
  'Proposé',
  'Ouvert',
  'En traitement',
  'Survenu',
  'Clos',
] as const satisfies readonly RiskStatus[];
export const RISK_VALIDATIONS = [
  'À évaluer',
  'À valider',
  'Validée',
] as const satisfies readonly RiskValidation[];
export const ACTION_NATURES = [
  'Préventive',
  'Corrective',
  'Contingence',
] as const satisfies readonly ActionNature[];
export const ACTION_STATUSES = [
  'À planifier',
  'En cours',
  'Réalisée',
  'Abandonnée',
] as const satisfies readonly ActionStatus[];

/** Score P × I, ou null si la cotation est incomplète. */
export const riskScore = (c: Cotation) => (c.p && c.i ? c.p * c.i : null);
/** Niveau d'un score sur l'échelle 5 × 5 : 1–4 faible, 5–9 modéré, 10–16 élevé, 17–25 critique. */
export const riskLevel = (score: number | null): RiskLevel | '' =>
  score === null ? '' : score <= 4 ? 'Faible' : score <= 9 ? 'Modéré' : score <= 16 ? 'Élevé' : 'Critique';

export const DILIGENCE_KINDS = [
  'Livrable',
  'Étude',
  'Arbitrage',
  'Fourniture',
] as const satisfies readonly DiligenceKind[];
export const DILIGENCE_KIND_HINT: Record<DiligenceKind, string> = {
  Livrable: 'Document ou maquette à produire',
  Étude: 'Analyse ou faisabilité à mener',
  Arbitrage: 'Décision à prendre par l’autorité compétente',
  Fourniture: 'Contenu, accès ou information à transmettre',
};
export const DILIGENCE_STATUSES = [
  'À faire',
  'En cours',
  'En attente',
  'Réalisée',
  'Abandonnée',
] as const satisfies readonly DiligenceStatus[];
/** Diligence encore à mener : ni réalisée ni abandonnée. */
export const diligenceOpen = (status: DiligenceStatus) => status !== 'Réalisée' && status !== 'Abandonnée';

export const LINK_TYPES = [
  'same',
  'duplicate',
  'dependsOn',
  'requiredBy',
  'related',
] as const satisfies readonly LinkType[];
export const LINK_LABEL: Record<LinkType, string> = {
  same: 'Même fonctionnalité',
  duplicate: 'Doublon',
  dependsOn: 'Dépend de',
  requiredBy: 'Nécessaire à',
  related: 'Voir aussi',
};
/** Ce que la liaison devient vue depuis l'autre US. */
export const LINK_INVERSE: Record<LinkType, LinkType> = {
  same: 'same',
  duplicate: 'duplicate',
  dependsOn: 'requiredBy',
  requiredBy: 'dependsOn',
  related: 'related',
};

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
  Validé: 'green',
  'En retard': 'red',
  'À venir': 'gray',
  Terminée: 'green',
  Faible: 'green',
  Modéré: 'yellow',
  Élevé: 'orange',
  Critique: 'red',
  Proposé: 'gray',
  'En traitement': 'blue',
  Survenu: 'red',
  Clos: 'green',
  'À évaluer': 'gray',
  'À valider': 'orange',
  Préventive: 'blue',
  Corrective: 'purple',
  Contingence: 'brown',
  'À planifier': 'gray',
  'En attente': 'yellow',
  Livrable: 'blue',
  Étude: 'purple',
  Arbitrage: 'orange',
  Fourniture: 'brown',
  Réalisée: 'green',
  Abandonnée: 'gray',
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
