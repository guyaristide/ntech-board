import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matches, pick } from '../src/mcp/context';

test('MCP : recherche sans accents ni casse, tous les mots présents', () => {
  assert.equal(matches('creer compte', 'Créer un compte touriste'), true);
  assert.equal(matches('compte OTP', 'Créer un compte', 'code OTP'), true);
  assert.equal(matches('paiement', 'Créer un compte'), false);
  assert.equal(matches(undefined, 'peu importe'), true);
});

test('MCP : une valeur se désigne par identifiant ou par libellé', () => {
  const steps = [
    { id: 'todo', name: 'À faire' },
    { id: 'done', name: 'Terminé' },
  ];
  assert.equal(pick(steps, 'done')?.id, 'done');
  assert.equal(pick(steps, 'termine')?.id, 'done');
  assert.equal(pick(steps, 'a faire')?.id, 'todo');
  assert.equal(pick(steps, 'Livré'), undefined);
});
