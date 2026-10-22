import { z } from 'zod';
import {
  ACTION_NATURES,
  FILE_CATEGORY_KEYS,
  MAX_FILE_MB,
  type FileCategory,
  ACTION_STATUSES,
  DILIGENCE_KINDS,
  DILIGENCE_STATUSES,
  LINK_TYPES,
  PARTY_TYPES,
  PHASE_STATUSES,
  ROLES,
  PRIORITIES,
  QUESTION_STATUSES,
  RACI_VALUES,
  RISK_STATUSES,
  RISK_VALIDATIONS,
  SCENARIOS,
  STATUSES,
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
const target = z.object({ platform: z.string().trim().min(1).max(80), module: z.string().trim().max(120) });

/** Champs d'une US modifiables par un éditeur. */
export const StoryPatch = z
  .object({
    epic: text(40),
    title: text(300),
    description: text(20000),
    targets: z.array(target).max(30),
    actor: text(80),
    asA: text(),
    iWant: text(),
    soThat: text(),
    acceptance: z.array(criterion).max(200),
    scenario: z.enum(SCENARIOS),
    source: text(300),
    version: text(40),
    workshop: text(40),
    priority: z.enum(PRIORITIES),
    status: z.enum(STATUSES),
    body: blocks,
  })
  .partial()
  .strict();

/** Liaison vers une autre US ; la liaison inverse est posée sur l'autre US. */
export const StoryLinkBody = z.object({ story: z.string().min(1).max(40), type: z.enum(LINK_TYPES) });

export const CreateStory = z.object({ epic: text(40).min(1), patch: StoryPatch.optional() });
export const CommentBody = z.object({ text: z.string().trim().min(1).max(5000) });
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
/** Nouveau risque : préfixe de son périmètre (R29, RG-11), parmi ceux des réglages du projet. */
export const RiskCreate = z.object({
  prefix: z
    .string()
    .regex(/^[A-Z]{1,4}-?$/)
    .default('R'),
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

// --- Diligences -------------------------------------------------------------------------

const ids = z.array(z.string().max(40)).max(200);
export const DiligencePatch = z
  .object({
    title: text(500),
    detail: text(8000),
    kind: z.enum(DILIGENCE_KINDS),
    owner: text(120),
    partners: text(300),
    dependency: text(),
    due: text(40),
    status: z.enum(DILIGENCE_STATUSES),
    outcome: text(8000),
    source: text(300),
    workshops: ids,
    stories: ids,
    risks: ids,
    notes: blocks,
  })
  .partial()
  .strict();
export const DiligenceCreate = z.object({ patch: DiligencePatch.optional() });

// --- Parties prenantes et réglages -------------------------------------------------------

export const PartyPatch = z
  .object({
    name: text(200),
    short: text(40),
    category: text(80),
    organization: text(40),
    holder: text(40),
    function: text(200),
    email: text(200),
    phone: text(60),
    userId: z.string().max(40).nullable(),
    aliases: z.array(z.string().trim().min(1).max(200)).max(50),
    notes: blocks,
  })
  .partial()
  .strict();
export const PartyCreate = z.object({ type: z.enum(PARTY_TYPES), patch: PartyPatch.optional() });

const step = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  category: z.enum(['todo', 'doing', 'done']),
});
const ticketType = z.object({ id: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(60) });
const userIds = z.array(z.string().max(40)).max(500);

/** Réglages modifiables par un administrateur ; chaque partie envoyée remplace la précédente. */
export const SettingsPatch = z
  .object({
    organizationTypes: z.array(z.string().trim().min(1).max(80)).max(30),
    versions: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    actors: z.array(z.string().trim().min(1).max(80)).max(100),
    referenceDocument: z.string().trim().min(1).max(80),
    mcp: z.object({ roles: z.array(z.enum(ROLES)).max(3) }),
    files: z
      .object({
        store: z.string().trim().min(1).max(40),
        root: z
          .string()
          .trim()
          .max(80)
          .regex(/^[\w./-]*$/),
        folders: z.enum(['element', 'type', 'date', 'flat', 'custom']),
        template: z
          .string()
          .trim()
          .max(160)
          .regex(/^[\w{}./-]*$/),
        maxMb: z.number().min(0.1).max(MAX_FILE_MB),
        categories: z.array(z.enum(FILE_CATEGORY_KEYS as [FileCategory, ...FileCategory[]])).max(10),
      })
      .partial(),
    riskScopes: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          prefix: z
            .string()
            .trim()
            .regex(/^[A-Z]{1,4}-?$/),
        }),
      )
      .min(1)
      .max(10),
    delivery: z
      .object({
        enabled: z.boolean(),
        key: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z][A-Z0-9]{0,9}$|^$/),
        sprintWeeks: z.number().int().min(1).max(8),
        estimation: z.enum(['points', 'days', 'hours', 'none']),
        workflow: z
          .array(step)
          .min(2)
          .max(15)
          .refine(w => w.some(s => s.category === 'done'), 'Une étape « Terminé » au moins.'),
        ticketTypes: z.array(ticketType).min(1).max(15),
        readiness: z.array(ticketType).max(15),
        visibility: z.object({
          roles: z.array(z.enum(ROLES)),
          organizations: z.array(z.string().max(40)).max(100),
          allow: userIds,
          deny: userIds,
        }),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();
