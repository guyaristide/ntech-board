/** Bloc de contenu libre, à la manière d'une page Notion. */
export type BlockType = 'p' | 'h2' | 'h3' | 'bullet' | 'todo' | 'quote' | 'callout';
export interface Block {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
}

export interface Comment {
  id: string;
  author: string;
  at: string;
  text: string;
}

export type Version = 'MVP' | 'V1' | 'V2' | 'Hors périmètre';
export type Priority = 'Must' | 'Should' | 'Could';
export type Scenario = 'nominal' | 'alternatif' | 'erreur' | 'exigence';
export type StoryStatus = 'À cadrer' | 'En atelier' | 'À revoir' | 'Validée' | 'Écartée';

export interface Criterion {
  id: string;
  text: string;
  done: boolean;
}

export interface Story {
  id: string;
  epic: string;
  title: string;
  actor: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptance: Criterion[];
  scenario: Scenario;
  source: string;
  version: Version;
  workshop: string;
  priority: Priority;
  derived: boolean;
  status: StoryStatus;
  body: Block[];
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface Epic {
  id: string;
  title: string;
  summary: string;
  workshops: string[];
  version: string;
  source: string;
  toFrame: string[];
  body: Block[];
}

export type QuestionStatus = 'Ouvert' | 'Tranché' | 'Reporté';
export interface Question {
  id: string;
  text: string;
  answer: string;
  status: QuestionStatus;
  /** Ajouté dans l'application, absent du planning. */
  custom?: boolean;
}

export interface Step {
  start: string | null;
  end: string | null;
  title: string;
  minutes: number | null;
}

export interface Session {
  code: string;
  atelier: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  title: string;
  content: string;
  owner: string;
  outcome: string;
  added: boolean;
  /** Renvoi au cahier des charges indiqué dans le planning (« UC 01 Compte »). */
  cdc: string;
  /** Fiches « Références CdC » qui concernent la séquence. */
  refs: string[];
  steps: Step[];
  questions: Question[];
  notes: Block[];
}

export type AgendaItem =
  | { kind: 'session'; code: string }
  | { kind: 'break'; start: string | null; end: string | null; title: string };

export type PvStatus = 'À faire' | 'En cours' | 'Diffusé' | 'Validé' | 'En retard';
export interface Workshop {
  id: string;
  title: string;
  phase: string;
  date: string | null;
  objectives: string[];
  questionnaire: string;
  raci: string[];
  risks: string[];
  deliverable: string;
  pv: string;
  pvDue: string | null;
  deliverableDue: string | null;
  validationDue: string | null;
  pvStatus: PvStatus;
  prep: { tab: string; due: string | null; questions: number; status: string }[];
  sessions: Session[];
  agenda: AgendaItem[];
  notes: Block[];
  comments: Comment[];
}

/** Fiche de l'onglet « Références CdC » du planning : ce que dit le cahier des charges sur un sujet. */
export interface Reference {
  id: string;
  subject: string;
  says: string[];
  where: string;
  gaps: string;
  sessions: string[];
}

export interface Workspace {
  /** Fichier de planning dont provient le programme. */
  planning?: string;
  references: Reference[];
  epics: Epic[];
  stories: Story[];
  workshops: Workshop[];
  phases?: Phase[];
  risks?: Risk[];
}

/**
 * RACI d'une activité : R réalise, A approuve (un seul par ligne), C consulté, I informé.
 * « A/R » : approuve et réalise.
 */
export type RaciValue = '' | 'R' | 'A' | 'A/R' | 'C' | 'I';

/** Partie prenante : une colonne de la matrice RACI. */
export interface RaciActor {
  id: string;
  name: string;
}

export interface RaciRow {
  /** Conservé quand une phase est créée par copie : sert à comparer deux phases. */
  id: string;
  activity: string;
  deliverable: string;
  /** Valeur par identifiant d'acteur. */
  cells: Record<string, RaciValue>;
}

export type PhaseStatus = 'À venir' | 'En cours' | 'Terminée';

/** Phase du projet, avec sa propre matrice RACI : la répartition des rôles évolue d'une phase à l'autre. */
export interface Phase {
  id: string;
  title: string;
  summary: string;
  start: string | null;
  end: string | null;
  status: PhaseStatus;
  actors: RaciActor[];
  raci: RaciRow[];
  notes: Block[];
  comments: Comment[];
}

export type RiskLevel = 'Faible' | 'Modéré' | 'Élevé' | 'Critique';
export type RiskStatus = 'Proposé' | 'Ouvert' | 'En traitement' | 'Survenu' | 'Clos';
export type RiskValidation = 'À évaluer' | 'À valider' | 'Validée';

/** Cotation probabilité × impact, chacune de 1 à 5 ; null tant que le risque n'est pas coté. */
export interface Cotation {
  p: number | null;
  i: number | null;
}

export type ActionNature = 'Préventive' | 'Corrective' | 'Contingence';
export type ActionStatus = 'À planifier' | 'En cours' | 'Réalisée' | 'Abandonnée';
export interface RiskAction {
  id: string;
  text: string;
  nature: ActionNature;
  owner: string;
  /** Date ISO, ou texte libre (« Continu »). */
  due: string;
  status: ActionStatus;
  evidence: string;
}

/** Revue d'un risque : la cotation telle qu'elle était à une date, dans une phase. */
export interface RiskReview {
  id: string;
  at: string;
  phase: string;
  initial: Cotation;
  residual: Cotation;
  status: RiskStatus;
  comment: string;
  author: string;
}

export interface Risk {
  id: string;
  scope: string;
  category: string;
  title: string;
  cause: string;
  consequence: string;
  initial: Cotation;
  residual: Cotation;
  mitigation: string;
  contingency: string;
  /** Propriétaire du risque, responsable de l'action, autorité d'arbitrage (PRINCE2). */
  owner: string;
  actionOwner: string;
  authority: string;
  /** Date ISO, ou texte libre (« Continu »). */
  due: string;
  indicator: string;
  status: RiskStatus;
  validation: RiskValidation;
  source: string;
  actions: RiskAction[];
  reviews: RiskReview[];
  notes: Block[];
  comments: Comment[];
}
