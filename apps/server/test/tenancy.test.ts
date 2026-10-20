import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostPatterns, slugFromHost } from '../src/hosts';

const patterns = hostPatterns(['{slug}-board.neiba-technologies.com', '{slug}-board.localhost']);

test('le sous-domaine désigne le projet', () => {
  assert.equal(slugFromHost('etourisme-board.neiba-technologies.com', patterns, ''), 'etourisme');
  assert.equal(slugFromHost('PFO-board.neiba-technologies.com', patterns, ''), 'pfo');
  assert.equal(slugFromHost('etourisme-board.localhost:5190', patterns, ''), 'etourisme');
});

test('un hôte inconnu renvoie le projet par défaut, ou rien', () => {
  assert.equal(slugFromHost('board.neiba-technologies.com', patterns, ''), null);
  assert.equal(slugFromHost('evil.com', patterns, 'etourisme'), 'etourisme');
  assert.equal(slugFromHost('etourisme-board.neiba-technologies.com.evil.com', patterns, ''), null);
});
