import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  byUrgency,
  closingObstacles,
  findingSummary,
  reopenCount,
  type Campaign,
  type Finding,
} from '@board/shared';

const finding = (id: string, patch: Partial<Finding> = {}) =>
  ({
    id,
    campaign: 'REC-01',
    severity: 'major',
    status: 'new',
    createdAt: `2026-11-2${id.slice(-1)}T09:00:00Z`,
    history: [],
    ...patch,
  }) as Finding;

test('retours : bilan des retours ouverts par gravité, clos et écartés hors compte', () => {
  const s = findingSummary([
    finding('RET-1', { severity: 'blocking', status: 'open' }),
    finding('RET-2', { severity: 'blocking', status: 'closed' }),
    finding('RET-3', { status: 'retest' }),
    finding('RET-4', { severity: 'minor' }),
    finding('RET-5', { severity: 'cosmetic', status: 'rejected' }),
  ]);
  assert.deepEqual(
    [s.total, s.open, s.toQualify, s.toRetest, s.bySeverity],
    [5, 3, 1, 1, { blocking: 1, major: 1, minor: 1, cosmetic: 0 }],
  );
});

test('retours : à retester d’abord, puis à qualifier, puis par gravité et ancienneté', () => {
  const sorted = [
    finding('RET-1', { status: 'open', severity: 'blocking' }),
    finding('RET-2', { status: 'closed' }),
    finding('RET-3', { status: 'new', severity: 'minor' }),
    finding('RET-4', { status: 'retest', severity: 'cosmetic' }),
    finding('RET-5', { status: 'new', severity: 'blocking' }),
  ].sort(byUrgency);
  assert.deepEqual(
    sorted.map(f => f.id),
    ['RET-4', 'RET-5', 'RET-3', 'RET-1', 'RET-2'],
  );
});

test('retours : nombre de réouvertures après un retest en échec', () => {
  const step = (from: string, to: string) =>
    ({ at: '', by: '', from, to, note: '' }) as Finding['history'][number];
  const f = finding('RET-1', {
    history: [
      step('', 'new'),
      step('new', 'open'),
      step('open', 'retest'),
      step('retest', 'open'),
      step('open', 'retest'),
      step('retest', 'open'),
    ],
  });
  assert.equal(reopenCount(f), 2);
});

test('clôture d’une campagne : cas à passer, retours bloquants ou majeurs ouverts, retests en attente', () => {
  const campaign = { id: 'REC-01' } as Campaign;
  const cases = [{ result: { status: 'ok' } }, { result: { status: '' } }, {}];
  const findings = [
    finding('RET-1', { severity: 'blocking', status: 'open' }),
    finding('RET-2', { status: 'retest' }),
    finding('RET-3', { severity: 'minor' }),
    finding('RET-4', { severity: 'blocking', campaign: 'REC-02' }),
  ];
  assert.deepEqual(closingObstacles(campaign, cases, findings), [
    '2 cas de test restent à passer',
    '1 retour bloquant ouvert',
    '1 retour majeur ouvert',
    '1 correction à retester',
  ]);
  assert.deepEqual(closingObstacles(campaign, [cases[0]], [finding('RET-3', { severity: 'minor' })]), []);
});
