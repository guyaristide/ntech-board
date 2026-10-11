import assert from 'node:assert/strict';
import { test } from 'node:test';
import { raciCheck, riskLevel, riskScore, type RaciActor } from '@board/shared';

const actors: RaciActor[] = [
  { id: 'sivis', name: 'SIVIS' },
  { id: 'cyb', name: 'Cybastion' },
  { id: 'lead', name: 'Lead Chef de projet' },
];

test('RACI : un seul A et au moins un R par ligne', () => {
  const row = (cells: Record<string, 'R' | 'A' | 'A/R' | 'C' | 'I'>) => ({
    id: 'L01',
    activity: '',
    deliverable: '',
    cells,
  });
  assert.equal(raciCheck(row({ sivis: 'A', lead: 'R' }), actors).ok, true);
  assert.equal(raciCheck(row({ cyb: 'A/R' }), actors).ok, true);
  assert.deepEqual(raciCheck(row({ sivis: 'A', cyb: 'A', lead: 'R' }), actors).problems, ['2 A']);
  assert.deepEqual(raciCheck(row({ sivis: 'C', lead: 'R' }), actors).problems, ['aucun A']);
  assert.deepEqual(raciCheck(row({ sivis: 'A' }), actors).problems, ['aucun R']);
  // Une cellule d'un acteur retiré de la phase ne compte plus.
  assert.equal(raciCheck(row({ ancien: 'A', lead: 'R' } as never), actors).ok, false);
});

test('Risques : score P × I et seuils de la matrice 5 × 5', () => {
  assert.equal(riskScore({ p: 4, i: 5 }), 20);
  assert.equal(riskScore({ p: null, i: 5 }), null);
  assert.deepEqual(
    [null, 4, 5, 9, 10, 16, 17, 25].map(riskLevel),
    ['', 'Faible', 'Modéré', 'Modéré', 'Élevé', 'Élevé', 'Critique', 'Critique'],
  );
});
