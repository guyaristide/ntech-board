import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStartFor, replannable, sprintPeriods, type Release, type Sprint } from '@board/shared';

const sprint = (id: string, start: string, end: string, status: Sprint['status'] = 'planned'): Sprint => ({
  id,
  name: id,
  goal: '',
  start,
  end,
  status,
  capacity: null,
  release: 'REL-01',
  review: [],
  retro: [],
  closedAt: null,
  velocity: null,
  carried: [],
});
const release: Release = {
  id: 'REL-01',
  name: 'MVP',
  goal: '',
  start: '2026-11-02',
  end: '2026-12-18',
  status: 'Prévue',
  versions: ['MVP'],
  notes: [],
};

test('sprints de deux semaines du lundi au vendredi, jusqu’à la livraison', () => {
  assert.deepEqual(sprintPeriods('2026-11-02', 2, { until: '2026-12-18' }), [
    { start: '2026-11-02', end: '2026-11-13' },
    { start: '2026-11-16', end: '2026-11-27' },
    { start: '2026-11-30', end: '2026-12-11' },
    { start: '2026-12-14', end: '2026-12-18' },
  ]);
});

test('un début le week-end passe au lundi ; en nombre de sprints', () => {
  assert.deepEqual(sprintPeriods('2026-11-01', 1, { count: 2 }), [
    { start: '2026-11-02', end: '2026-11-06' },
    { start: '2026-11-09', end: '2026-11-13' },
  ]);
});

test('les sprints suivants d’une version partent après son dernier sprint', () => {
  assert.equal(nextStartFor(release, [], 2), '2026-11-02');
  assert.equal(nextStartFor(release, [sprint('SP-01', '2026-11-02', '2026-11-13')], 2), '2026-11-16');
});

test('le recalage ne déplace que les sprints pas encore commencés', () => {
  const list = [
    sprint('SP-02', '2026-11-16', '2026-11-27'),
    sprint('SP-01', '2026-11-02', '2026-11-13', 'active'),
    sprint('SP-03', '2026-11-30', '2026-12-11'),
  ];
  assert.deepEqual(
    replannable('REL-01', list).map(s => s.id),
    ['SP-02', 'SP-03'],
  );
});
