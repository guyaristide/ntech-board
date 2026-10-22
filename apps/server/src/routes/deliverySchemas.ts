import { z } from 'zod';
import { RELEASE_STATUSES, TICKET_LINK_TYPES } from '@board/shared';
import { blocks } from './schemas';

/** Saisies de la partie Réalisation : versions, sprints, tickets. */
const text = (max = 2000) => z.string().max(max);
const day = z.iso.date().nullable();
const id = z.string().max(40);
const amount = z.number().min(0).max(10000).nullable();

export const ReleasePatch = z
  .object({
    name: text(120),
    goal: text(4000),
    start: day,
    end: day,
    status: z.enum(RELEASE_STATUSES),
    versions: z.array(text(40)).max(10),
    notes: blocks,
  })
  .partial()
  .strict();
export const ReleaseCreate = z.object({ patch: ReleasePatch.optional() });

export const SprintPatch = z
  .object({
    name: text(120),
    goal: text(4000),
    start: day,
    end: day,
    capacity: amount,
    release: id,
    review: blocks,
    retro: blocks,
  })
  .partial()
  .strict();
export const SprintCreate = z.object({ patch: SprintPatch.optional() });
/** Clôture : les tickets non terminés vont au backlog, ou dans le sprint indiqué. */
export const SprintClose = z.object({ moveTo: id.default('') });

export const TicketPatch = z
  .object({
    type: id,
    title: text(500),
    status: id,
    estimate: amount,
    release: id,
    sprint: id,
    rank: z.number().finite(),
    ready: z.array(id).max(30),
    assignee: id,
    parent: id,
    description: blocks,
  })
  .partial()
  .strict();
/** Création : un ticket libre, ou un ticket « US » par US du cadrage citée. */
export const TicketCreate = z.union([
  z.object({ stories: z.array(id).min(1).max(1000), patch: TicketPatch.optional() }),
  z.object({ patch: TicketPatch.extend({ title: z.string().trim().min(1).max(500) }) }),
]);

/** Actions groupées sur des tickets choisis : version, sprint, étape, responsable, type. */
const ticketIds = z.array(z.string().min(1).max(40)).min(1).max(500);
export const TicketBulk = z.object({
  ids: ticketIds,
  patch: TicketPatch.pick({ type: true, status: true, release: true, sprint: true, assignee: true }).refine(
    p => Object.keys(p).length > 0,
    { message: 'empty' },
  ),
});
export const TicketIds = z.object({ ids: ticketIds });

export const TicketLinkBody = z.object({
  ticket: z.string().min(1).max(40),
  type: z.enum(TICKET_LINK_TYPES),
});

/** Création en série des sprints d'une version : jusqu'à une date, ou un nombre de sprints. */
export const SprintPlan = z
  .object({
    start: z.iso.date(),
    weeks: z.number().int().min(1).max(8),
    until: z.iso.date().nullable().default(null),
    count: z.number().int().min(1).max(26).nullable().default(null),
    capacity: amount.default(null),
  })
  .refine(p => p.until || p.count, { message: 'until_or_count' });
/**
 * Mise à jour en série des sprints d'une version. Dates : les sprints pas encore commencés sont
 * réenchaînés à partir de `start`, sur `weeks` semaines. Capacité : sprints prévus et en cours.
 */
export const SprintReplan = z
  .object({
    start: z.iso.date().nullable().default(null),
    weeks: z.number().int().min(1).max(8).nullable().default(null),
    capacity: amount.optional(),
  })
  .strict();
