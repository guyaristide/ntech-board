import { z } from 'zod';
import {
  ACTION_NATURES,
  ACTION_STATUSES,
  PHASE_STATUSES,
  PRIORITIES,
  QUESTION_STATUSES,
  PV_STATUSES,
  RACI_VALUES,
  RISK_STATUSES,
  RISK_VALIDATIONS,
  SCENARIOS,
  STATUSES,
  VERSIONS,
} from '@board/shared';

const text = (max = 2000) => z.string().max(max);
const block = z.object({
  id: z.string().max(40),
  type: z.enum(['p', 'h2', 'h3', 'bullet', 'todo', 'quote', 'callout']),
  text: text(20000),
  checked: z.boolean().optional(),
});
export const blocks = z.array(block).max(2000);
const criterion = z.object({ id: z.string().max(40), text: text(4000), done: z.boolean() });

/** Champs d'une US modifiables par un éditeur. */
export const StoryPatch = z
  .object({
    epic: text(40),
    title: text(300),
    actor: text(80),
    asA: text(),
    iWant: text(),
    soThat: text(),
    acceptance: z.array(criterion).max(200),
    scenario: z.enum(SCENARIOS),
    source: text(300),
    version: z.enum(VERSIONS),
    workshop: text(40),
    priority: z.enum(PRIORITIES),
    status: z.enum(STATUSES),
    body: blocks,
  })
  .partial()
  .strict();

export const CreateStory = z.object({ epic: text(40).min(1), patch: StoryPatch.optional() });
export const CommentBody = z.object({ text: z.string().trim().min(1).max(5000) });
export const EpicPatch = z.object({ body: blocks }).strict();
export const WorkshopPatch = z
  .object({ notes: blocks, pvStatus: z.enum(PV_STATUSES) })
  .partial()
  .strict();
export const SessionPatch = z.object({ notes: blocks }).strict();
export const QuestionPatch = z
  .object({ text: text(1000), answer: text(5000), status: z.enum(QUESTION_STATUSES) })
  .partial()
  .strict();
export const QuestionCreate = z.object({ text: z.string().trim().min(1).max(1000) });
export const PresenceBody = z.object({ path: z.string().max(300) });

// --- Phases et RACI -----------------------------------------------------------------------

const day = z.iso.date().nullable();
const actor = z.object({ id: z.string().min(1).max(40), name: text(120) });
const raciValue = z.enum(['', ...RACI_VALUES]);

export const PhasePatch = z
  .object({
    title: text(200),
    summary: text(4000),
    start: day,
    end: day,
    status: z.enum(PHASE_STATUSES),
    actors: z.array(actor).max(40),
    notes: blocks,
  })
  .partial()
  .strict();
/** Nouvelle phase, vide ou copiée d'une autre (acteurs et matrice RACI). */
export const PhaseCreate = z.object({
  title: z.string().trim().min(1).max(200),
  copyFrom: text(40).optional(),
});
export const RaciRowCreate = z.object({
  activity: text(500).default(''),
  deliverable: text(500).default(''),
  /** Insère la ligne après celle-ci ; à la fin sinon. */
  after: text(40).optional(),
});
/** Les cellules sont fusionnées une à une : deux personnes peuvent remplir la même ligne. */
export const RaciRowPatch = z
  .object({
    activity: text(500),
    deliverable: text(500),
    cells: z.record(z.string().max(40), raciValue),
  })
  .partial()
  .strict();

// --- Risques ----------------------------------------------------------------------------

const level = z.number().int().min(1).max(5).nullable();
const cotation = z.object({ p: level, i: level });

export const RiskPatch = z
  .object({
    scope: text(120),
    category: text(120),
    title: text(500),
    cause: text(),
    consequence: text(),
    initial: cotation,
    residual: cotation,
    mitigation: text(4000),
    contingency: text(4000),
    owner: text(120),
    actionOwner: text(120),
    authority: text(120),
    due: text(40),
    indicator: text(),
    status: z.enum(RISK_STATUSES),
    validation: z.enum(RISK_VALIDATIONS),
    notes: blocks,
  })
  .partial()
  .strict();
/** Nouveau risque : R29 (projet) ou RG-11 (groupement). */
export const RiskCreate = z.object({
  prefix: z.enum(['R', 'RG-']).default('R'),
  patch: RiskPatch.optional(),
});
export const RiskActionPatch = z
  .object({
    text: text(2000),
    nature: z.enum(ACTION_NATURES),
    owner: text(120),
    due: text(40),
    status: z.enum(ACTION_STATUSES),
    evidence: text(),
  })
  .partial()
  .strict();
export const RiskReviewCreate = z.object({ phase: text(40), comment: text(4000).default('') });
