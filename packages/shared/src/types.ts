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
}
