import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  isReady,
  nextSprintDates,
  progress,
  rankAt,
  withSettingsDefaults,
  workdaysLeft,
  type Sprint,
  type Ticket,
} from '@board/shared';

const ticket = (id: string, patch: Partial<Ticket> = {}): Ticket => ({
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
  description: [],
  comments: [],
  createdAt: '',
  updatedAt: '',
  ...patch,
});

test('un nouveau sprint commence le lundi et finit le vendredi de sa dernière semaine', () => {
  // Samedi 17/10/2026 : premier sprint le lundi suivant.
  assert.deepEqual(nextSprintDates([], 2, '2026-10-17'), { start: '2026-10-19', end: '2026-10-30' });
  // Mercredi 21/10 : la semaine en cours.
  assert.deepEqual(nextSprintDates([], 1, '2026-10-21'), { start: '2026-10-19', end: '2026-10-23' });
  // Après un sprint qui finit le vendredi 30/10 : lundi 2/11.
  const previous = { end: '2026-10-30' } as Sprint;
  assert.deepEqual(nextSprintDates([previous], 3, '2026-10-21'), { start: '2026-11-02', end: '2026-11-20' });
});

test('jours ouvrés restants d’un sprint', () => {
  assert.equal(workdaysLeft('2026-10-30', '2026-10-26'), 5);
  assert.equal(workdaysLeft('2026-10-30', '2026-10-31'), 0);
  assert.equal(workdaysLeft(null), 0);
  // Sprint à venir : compté à partir de son début.
  assert.equal(workdaysLeft('2026-11-13', '2026-10-17', '2026-11-02'), 10);
});

test('un ticket déposé prend le rang du milieu entre ses voisins', () => {
  const list = [ticket('A', { rank: 1 }), ticket('B', { rank: 2 }), ticket('C', { rank: 3 })];
  assert.equal(rankAt(list, 'B', 'C'), 1.5);
  assert.equal(rankAt(list, 'A', 'C'), 0);
  assert.equal(rankAt(list, null, 'A'), 4);
  assert.equal(rankAt([], null, 'X'), 1);
});

test('un ticket est prêt quand tous les critères sont cochés et qu’il est estimé', () => {
  const s = DEFAULT_SETTINGS;
  const all = s.delivery.readiness.map(c => c.id);
  assert.equal(isReady(s, ticket('A', { ready: all })), false);
  assert.equal(isReady(s, ticket('A', { ready: all, estimate: 3 })), true);
  assert.equal(isReady(s, ticket('A', { ready: all.slice(1), estimate: 3 })), false);
  const noEstimate = withSettingsDefaults({ delivery: { ...s.delivery, estimation: 'none' } });
  assert.equal(isReady(noEstimate, ticket('A', { ready: all })), true);
});

test('avancement : estimation terminée sur estimation totale', () => {
  const p = progress(DEFAULT_SETTINGS, [
    ticket('A', { estimate: 3, status: 'done' }),
    ticket('B', { estimate: 5, status: 'doing' }),
    ticket('C', { status: 'done' }),
  ]);
  assert.deepEqual(p, { done: 3, total: 8, count: 3, doneCount: 2 });
});
