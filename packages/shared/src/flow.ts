import { isDone, stepOf, type Ticket } from './delivery';
import type { ProjectSettings } from './parties';

/**
 * Indicateurs de flux : temps de cycle, temps passé par étape, tickets en cours qui vieillissent,
 * débit hebdomadaire. Tout se déduit de l'historique des changements d'étape des tickets.
 */

/** Changement d'étape d'un ticket, tel que le journal du projet l'a enregistré. */
export interface StatusChange {
  ticket: string;
  at: string;
  status: string;
}

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.max(0, (Date.parse(to) - Date.parse(from)) / DAY);

/** Centile d'une série (rang le plus proche) ; null si elle est vide. */
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

export interface TicketFlow {
  id: string;
  /** Première entrée dans une étape « en cours » (ou directement « terminé »). */
  startedAt: string | null;
  /** Dernière entrée dans une étape « terminé », si le ticket y est encore. */
  doneAt: string | null;
  /** Entrée dans l'étape actuelle. */
  since: string;
  /** Jours passés dans chaque étape, par identifiant d'étape. */
  steps: Record<string, number>;
}

/**
 * Parcours d'un ticket. Avant son premier changement d'étape, il est réputé dans la première étape
 * du flux ; sans aucun changement, dans son étape actuelle depuis sa création.
 */
export function ticketFlow(
  settings: ProjectSettings,
  ticket: Ticket,
  changes: StatusChange[],
  now: string,
): TicketFlow {
  const own = changes.filter(c => c.ticket === ticket.id).sort((a, b) => a.at.localeCompare(b.at));
  const first = settings.delivery.workflow[0]?.id ?? ticket.status;
  const path = [{ at: ticket.createdAt, status: own.length ? first : ticket.status }, ...own];
  const steps: Record<string, number> = {};
  let startedAt: string | null = null;
  let doneAt: string | null = null;
  path.forEach((p, i) => {
    const category = stepOf(settings, p.status)?.category;
    if (category !== 'todo' && !startedAt) startedAt = p.at;
    if (category === 'done') doneAt ??= p.at;
    else doneAt = null;
    steps[p.status] = (steps[p.status] ?? 0) + days(p.at, path[i + 1]?.at ?? now);
  });
  return {
    id: ticket.id,
    startedAt,
    doneAt: isDone(settings, ticket) ? doneAt : null,
    since: path[path.length - 1].at,
    steps,
  };
}

export interface AgingTicket {
  ticket: Ticket;
  /** Jours depuis l'entrée en cours. */
  age: number;
  /** Jours dans l'étape actuelle. */
  inStep: number;
  /** Plus vieux que 85 % des tickets terminés : à regarder. */
  stale: boolean;
}

export interface FlowMetrics {
  /** Tickets terminés sur la période, passés par une étape « en cours ». */
  finished: number;
  /** Temps de cycle (entrée en cours → terminé), en jours : médiane et 85e centile. */
  cycle: { median: number | null; p85: number | null };
  /** Délai complet (création → terminé), en jours : médiane. */
  lead: number | null;
  /** Temps moyen par étape non terminale, pour les tickets terminés sur la période. */
  steps: { id: string; name: string; category: string; days: number }[];
  /** Tickets en cours, du plus ancien au plus récent. */
  aging: AgingTicket[];
  /** Tickets terminés par semaine (lundi de la semaine), de la plus ancienne à la plus récente. */
  throughput: { week: string; count: number }[];
}

const monday = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/** Indicateurs de flux du projet, sur les `windowDays` derniers jours pour les tickets terminés. */
export function flowMetrics(
  settings: ProjectSettings,
  tickets: Ticket[],
  changes: StatusChange[],
  now = new Date().toISOString(),
  windowDays = 90,
  weeks = 8,
): FlowMetrics {
  const byTicket = new Map<string, StatusChange[]>();
  for (const c of changes) byTicket.set(c.ticket, [...(byTicket.get(c.ticket) ?? []), c]);
  const flows = tickets.map(t => ({ t, f: ticketFlow(settings, t, byTicket.get(t.id) ?? [], now) }));
  const done = flows.filter(x => x.f.doneAt && days(x.f.doneAt, now) <= windowDays);
  // Un ticket passé directement de « à faire » à « terminé » n'a pas de temps de cycle mesurable.
  const cycled = done.filter(x => x.f.startedAt && x.f.startedAt < x.f.doneAt!);
  const cycles = cycled.map(x => days(x.f.startedAt!, x.f.doneAt!));
  const p85 = percentile(cycles, 85);
  const open = settings.delivery.workflow.filter(s => s.category !== 'done');
  const firstWeek = monday(new Date(Date.parse(now) - (weeks - 1) * 7 * DAY).toISOString());
  const throughput = Array.from({ length: weeks }, (_, i) => {
    const week = new Date(Date.parse(`${firstWeek}T12:00:00Z`) + i * 7 * DAY).toISOString().slice(0, 10);
    return { week, count: flows.filter(x => x.f.doneAt && monday(x.f.doneAt) === week).length };
  });
  return {
    finished: cycled.length,
    cycle: { median: percentile(cycles, 50), p85 },
    lead: percentile(
      done.map(x => days(x.t.createdAt, x.f.doneAt!)),
      50,
    ),
    steps: open.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
      days: cycled.length ? cycled.reduce((n, x) => n + (x.f.steps[s.id] ?? 0), 0) / cycled.length : 0,
    })),
    aging: flows
      .filter(x => stepOf(settings, x.t.status)?.category === 'doing')
      .map(x => {
        const age = days(x.f.startedAt ?? x.f.since, now);
        return { ticket: x.t, age, inStep: days(x.f.since, now), stale: p85 !== null && age > p85 };
      })
      .sort((a, b) => b.age - a.age),
    throughput,
  };
}
