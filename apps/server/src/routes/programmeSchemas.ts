import { z } from 'zod';
import { PV_STATUSES } from '@board/shared';
import { blocks } from './schemas';

/** Saisies du programme construit dans l'outil : ateliers, séquences, ordre du jour, épiques. */
const text = (max = 2000) => z.string().max(max);
const day = z.iso.date().nullable();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
/** Code choisi à la création (J10, UC16) : lettres, chiffres, tirets. */
export const Code = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9-]{0,11}$/);
const id = z.string().max(40);

export const WorkshopPatch = z
  .object({
    title: text(300),
    phase: text(300),
    date: day,
    objectives: z.array(text(1000)).max(50),
    questionnaire: text(2000),
    deliverable: text(4000),
    pv: text(2000),
    pvDue: day,
    deliverableDue: day,
    validationDue: day,
    pvStatus: z.enum(PV_STATUSES),
    notes: blocks,
  })
  .partial()
  .strict();
export const WorkshopCreate = z.object({ id: Code.optional(), patch: WorkshopPatch.optional() });

const step = z.object({
  start: time,
  end: time,
  title: text(500),
  minutes: z.number().int().min(0).max(1440).nullable(),
});
export const SessionPatch = z
  .object({
    title: text(300),
    start: time,
    end: time,
    allDay: z.boolean(),
    content: text(10000),
    owner: text(300),
    outcome: text(2000),
    cdc: text(300),
    refs: z.array(id).max(50),
    steps: z.array(step).max(60),
    notes: blocks,
  })
  .partial()
  .strict();
export const SessionCreate = z.object({ patch: SessionPatch.optional() });

export const AgendaBody = z.object({
  agenda: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('session'), code: id }),
        z.object({ kind: z.literal('break'), start: time, end: time, title: text(200) }),
      ]),
    )
    .max(100),
});

export const EpicPatch = z
  .object({
    title: text(300),
    summary: text(4000),
    version: text(40),
    workshops: z.array(id).max(50),
    source: text(300),
    toFrame: z.array(text(1000)).max(100),
    body: blocks,
  })
  .partial()
  .strict();
export const EpicCreate = z.object({ id: Code.optional(), patch: EpicPatch.optional() });
