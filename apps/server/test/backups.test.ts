import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupsToPrune, type BackupPolicy, type BackupReason } from '@board/shared';

const policy: BackupPolicy = { hour: 2, daily: 14, weekly: 8, monthly: 12, safetyDays: 90 };
const NOW = '2026-11-23T03:00:00Z';
const ago = (days: number, reason: BackupReason = 'scheduled') => ({
  id: `${reason}-${days}`,
  reason,
  createdAt: new Date(Date.parse(NOW) - days * 86_400_000).toISOString(),
});

test('conservation : tout pendant 14 jours, puis une par semaine, puis une par mois', () => {
  const list = Array.from({ length: 200 }, (_, i) => ago(i));
  const pruned = new Set(backupsToPrune(list, policy, NOW));
  const kept = list.filter(b => !pruned.has(b.id));
  // Les 15 premières (aujourd'hui compris) sont toutes gardées.
  assert.deepEqual(
    kept.slice(0, 15).map(b => b.id),
    list.slice(0, 15).map(b => b.id),
  );
  // Ensuite, jamais deux sauvegardes de la même semaine, puis jamais deux du même mois.
  const weekly = kept.filter(b => b.id !== 'scheduled-0').slice(14, 14 + 8);
  for (let i = 1; i < weekly.length; i++)
    assert.ok(Date.parse(weekly[i - 1].createdAt) - Date.parse(weekly[i].createdAt) >= 6 * 86_400_000);
  const months = kept.slice(15 + 9).map(b => b.createdAt.slice(0, 7));
  assert.equal(new Set(months).size, months.length);
  assert.ok(kept.length < 40, `${kept.length} gardées`);
});

test('conservation : la plus récente et les manuelles restent ; les sauvegardes de sécurité expirent', () => {
  const list = [ago(900), ago(400, 'manual'), ago(30, 'before-restore'), ago(91, 'before-delete')];
  assert.deepEqual(backupsToPrune(list, policy, NOW), ['before-delete-91']);
  assert.deepEqual(backupsToPrune([ago(500), ago(900)], policy, NOW), ['scheduled-900']);
});
