import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  flowMetrics,
  forecastRange,
  percentile,
  ticketFlow,
  type Release,
  type Sprint,
  type StatusChange,
  type Ticket,
} from '@board/shared';

const settings = DEFAULT_SETTINGS;
const ticket = (id: string, patch: Partial<Ticket> = {}) =>
  ({
    id,
    title: id,
    status: 'todo',
    estimate: null,
    release: '',
    createdAt: '2026-11-01T08:00:00Z',
    ...patch,
  }) as Ticket;
const change = (ticket: string, day: number, status: string): StatusChange => ({
  ticket,
  at: `2026-11-${String(day).padStart(2, '0')}T08:00:00Z`,
  status,
});
const NOW = '2026-11-21T08:00:00Z';

test('centile : rang le plus proche, null pour une série vide', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 85), 9);
});

test('parcours d’un ticket : temps par étape, entrée en cours, fin ; un retour en arrière annule la fin', () => {
  const t = ticket('A', { status: 'done' });
  const f = ticketFlow(
    settings,
    t,
    [change('A', 3, 'doing'), change('A', 5, 'review'), change('A', 6, 'doing'), change('A', 9, 'done')],
    NOW,
  );
  assert.equal(f.startedAt, '2026-11-03T08:00:00Z');
  assert.equal(f.doneAt, '2026-11-09T08:00:00Z');
  assert.deepEqual([f.steps.todo, f.steps.doing, f.steps.review], [2, 5, 1]);
  const back = ticketFlow(
    settings,
    ticket('B', { status: 'doing' }),
    [change('B', 2, 'done'), change('B', 4, 'doing')],
    NOW,
  );
  assert.equal(back.doneAt, null);
  assert.equal(back.since, '2026-11-04T08:00:00Z');
});

test('flux : temps de cycle, délai, débit, et tickets en cours plus vieux que 85 % des terminés', () => {
  const tickets = [
    ticket('A', { status: 'done' }),
    ticket('B', { status: 'done' }),
    ticket('C', { status: 'done' }),
    ticket('D', { status: 'doing' }),
    ticket('E', { status: 'review' }),
    ticket('F'),
  ];
  const changes = [
    ...[change('A', 2, 'doing'), change('A', 4, 'done')],
    ...[change('B', 2, 'doing'), change('B', 6, 'done')],
    // Passé directement à « terminé » : compte dans le débit, pas dans le temps de cycle.
    change('C', 10, 'done'),
    change('D', 5, 'doing'),
    ...[change('E', 18, 'doing'), change('E', 20, 'review')],
  ];
  const m = flowMetrics(settings, tickets, changes, NOW);
  assert.equal(m.finished, 2);
  assert.deepEqual(m.cycle, { median: 2, p85: 4 });
  assert.equal(m.lead, 5);
  assert.deepEqual(
    m.aging.map(a => [a.ticket.id, a.age, a.inStep, a.stale]),
    [
      ['D', 16, 16, true],
      ['E', 3, 1, false],
    ],
  );
  assert.equal(m.steps.find(s => s.id === 'doing')!.days, 3);
  assert.equal(
    m.throughput.reduce((n, w) => n + w.count, 0),
    3,
  );
  assert.equal(m.throughput.at(-1)!.week, '2026-11-16');
});

test('prévision probabiliste : fourchette stable, date prudente après la date probable, chances de tenir la date', () => {
  const sprint = (id: string, velocity: number, end: string) =>
    ({ id, status: 'closed', velocity, end, closedAt: end }) as unknown as Sprint;
  const sprints = [
    sprint('S1', 4, '2026-09-18'),
    sprint('S2', 10, '2026-10-02'),
    sprint('S3', 6, '2026-10-16'),
  ];
  const tickets = [ticket('A', { release: 'R', estimate: 30 })];
  const s = { ...settings, delivery: { ...settings.delivery, sprintWeeks: 2 } };
  const r = { id: 'R', end: '2026-12-25' } as Release;
  const f = forecastRange(s, r, tickets, sprints, '2026-10-21')!;
  assert.deepEqual(f, forecastRange(s, r, tickets, sprints, '2026-10-21'));
  assert.ok(f.likely.sprints >= 3 && f.likely.sprints <= 6, `${f.likely.sprints}`);
  assert.ok(f.safe.sprints >= f.likely.sprints);
  assert.ok(f.safe.date >= f.likely.date);
  assert.ok(f.onTime! > 0 && f.onTime! < 1, `${f.onTime}`);
  // Trop peu d'historique, ou plus rien à faire : pas de fourchette.
  assert.equal(forecastRange(s, r, tickets, sprints.slice(0, 2), '2026-10-21'), null);
  assert.equal(
    forecastRange(s, r, [ticket('A', { release: 'R', estimate: 3, status: 'done' })], sprints),
    null,
  );
});
