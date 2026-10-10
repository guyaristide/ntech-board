import { z } from 'zod';
import { PRIORITIES, QUESTION_STATUSES, PV_STATUSES, SCENARIOS, STATUSES, VERSIONS } from '@board/shared';

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
