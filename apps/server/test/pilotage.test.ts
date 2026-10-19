import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  burndown,
  forecast,
  mentionsOrganization,
  newParty,
  partiesOfOrganization,
  progressBy,
  velocity,
  type Release,
  type Sprint,
  type Story,
  type Ticket,
} from '@board/shared';

const settings = DEFAULT_SETTINGS;
const done = settings.delivery.workflow.find(s => s.category === 'done')!.id;
const ticket = (id: string, patch: Partial<Ticket> = {}) =>
  ({
    id,
    type: 'story',
    title: id,
    story: '',
    parent: '',
    status: 'todo',
    estimate: null,
    release: '',
    sprint: '',
    rank: 1,
    ready: [],
    assignee: '',
    links: [],
    description: [],
    comments: [],
    createdAt: '',
    updatedAt: '',
    ...patch,
  }) as Ticket;
const sprint = (id: string, patch: Partial<Sprint> = {}) =>
  ({
    id,
    name: id,
    goal: '',
    start: null,
    end: null,
    status: 'planned',
    capacity: null,
    release: '',
    review: [],
    retro: [],
    closedAt: null,
    velocity: null,
    carried: [],
    ...patch,
  }) as Sprint;

test('burndown : un point par jour ouvré, le dernier relevé reporté, rien dans le futur', () => {
  const s = sprint('S1', { start: '2026-10-19', end: '2026-10-30', status: 'active' });
  const b = burndown(
    settings,
    s,
    [
      { day: '2026-10-19', total: 20, done: 0, count: 4, doneCount: 0 },
      { day: '2026-10-21', total: 23, done: 8, count: 5, doneCount: 2 },
    ],
    '2026-10-22',
  )!;
  assert.equal(b.points.length, 10);
  assert.equal(b.start, 20);
  assert.deepEqual(
    b.points.slice(0, 5).map(p => p.remaining),
    [20, 20, 15, 15, null],
  );
  assert.equal(b.points[2].scope, 23);
  assert.equal(b.points[0].ideal, 20);
  assert.equal(b.points[9].ideal, 0);
});

test('vélocité : moyenne des trois derniers sprints clos', () => {
  const list = [8, 10, 12, 14].map((v, i) =>
    sprint(`S${i}`, { status: 'closed', end: `2026-0${i + 1}-15`, velocity: v, delivered: v / 2 }),
  );
  assert.equal(velocity(list).average, 12);
  assert.equal(velocity(list, true).average, 6);
  assert.equal(velocity([sprint('X')]).average, null);
});

test('prévision : reste à faire / vélocité, comptée après le sprint en cours', () => {
  const r = { id: 'REL-01', end: '2026-11-15' } as Release;
  const tickets = [
    ticket('A', { release: 'REL-01', estimate: 10 }),
    ticket('B', { release: 'REL-01', estimate: 5, status: done }),
  ];
  const sprints = [
    sprint('S0', { status: 'closed', velocity: 4, end: '2026-10-16' }),
    sprint('S1', { status: 'active', end: '2026-10-30' }),
  ];
  const f = forecast(
    { ...settings, delivery: { ...settings.delivery, sprintWeeks: 2 } },
    r,
    tickets,
    sprints,
    '2026-10-21',
  );
  assert.equal(f.remaining, 10);
  assert.equal(f.sprints, 3);
  assert.equal(f.date, '2026-12-11');
  assert.equal(f.late, true);
});

test('avancement par regroupement : une US terminée a tous ses tickets terminés', () => {
  const story = (id: string, epic: string, status = 'Validée') =>
    ({ id, epic, status, targets: [] }) as unknown as Story;
  const stories = [
    story('US-1', 'UC01'),
    story('US-2', 'UC01', 'À cadrer'),
    story('US-3', 'UC01', 'Écartée'),
  ];
  const tickets = [
    ticket('T1', { story: 'US-1', estimate: 3, status: done }),
    ticket('T2', { parent: 'T1', estimate: 2 }),
    ticket('T3', { story: 'US-2', estimate: 5, status: done }),
  ];
  const [g] = progressBy(settings, stories, tickets, [{ key: 'UC01', label: 'UC01' }], s => [s.epic]);
  assert.deepEqual(
    {
      stories: g.stories,
      validated: g.validated,
      started: g.started,
      finished: g.finished,
      total: g.total,
      done: g.done,
    },
    { stories: 2, validated: 1, started: 2, finished: 1, total: 10, done: 8 },
  );
});

test('organisation : ses personnes, ses rôles, et les mentions en texte libre', () => {
  const parties = [
    newParty('ORG-01', 'organization', { name: 'NTECH SARL', short: 'NTECH' }),
    newParty('ORG-02', 'organization', { name: 'Ministère du Tourisme', short: 'MTL' }),
    newParty('PER-01', 'person', { name: 'Awa Koné', organization: 'ORG-01' }),
    newParty('ROL-01', 'role', { name: 'Chef de projet', holder: 'PER-01' }),
    newParty('ROL-02', 'role', { name: 'Directeur du tourisme', organization: 'ORG-02' }),
  ];
  assert.deepEqual([...partiesOfOrganization(parties, 'ORG-01')].sort(), ['ORG-01', 'PER-01', 'ROL-01']);
  assert.equal(mentionsOrganization(parties, 'ORG-01', 'NTECH, Chef de projet'), true);
  assert.equal(mentionsOrganization(parties, 'ORG-01', 'MTL'), false);
  assert.equal(mentionsOrganization(parties, 'ORG-02', 'Directeur du tourisme'), true);
});
