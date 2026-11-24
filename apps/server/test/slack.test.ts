import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { parseSlackCommand, slackEscape, slackLink } from '@board/shared';
import { validSlackSignature } from '../src/slack/signature';

test('commande /board : verbes français et anglais, identifiant seul, recherche par défaut', () => {
  assert.deepEqual(parseSlackCommand(''), { name: 'help' });
  assert.deepEqual(parseSlackCommand('  Aide '), { name: 'help' });
  assert.deepEqual(parseSlackCommand('ticket Corriger   le pied de page'), {
    name: 'create',
    title: 'Corriger le pied de page',
  });
  assert.deepEqual(parseSlackCommand('créer Un ticket'), { name: 'create', title: 'Un ticket' });
  assert.deepEqual(parseSlackCommand('ETO-12'), { name: 'show', id: 'ETO-12' });
  assert.deepEqual(parseSlackCommand('US-UC01-03'), { name: 'show', id: 'US-UC01-03' });
  assert.deepEqual(parseSlackCommand('voir r01'), { name: 'show', id: 'r01' });
  assert.deepEqual(parseSlackCommand('mes tickets'), { name: 'mine' });
  assert.deepEqual(parseSlackCommand('statut ETO-12 en revue'), {
    name: 'status',
    id: 'ETO-12',
    step: 'en revue',
  });
  assert.deepEqual(parseSlackCommand('commenter ETO-12 Vu, je prends'), {
    name: 'comment',
    id: 'ETO-12',
    text: 'Vu, je prends',
  });
  assert.deepEqual(parseSlackCommand('search paiement mobile'), { name: 'search', query: 'paiement mobile' });
  assert.deepEqual(parseSlackCommand('paiement mobile'), { name: 'search', query: 'paiement mobile' });
  assert.deepEqual(parseSlackCommand('délier'), { name: 'unlink' });
  // Verbe sans ce qu'il lui faut : l'aide, plutôt qu'une action à moitié comprise.
  assert.deepEqual(parseSlackCommand('ticket'), { name: 'help' });
});

test('signature Slack : bon secret et horodatage récent seulement', () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const now = 1_800_000_000_000;
  const ts = String(now / 1000);
  const raw = 'team_id=T1&user_id=U1&text=aide';
  const sign = (s: string, t = ts, body = raw) =>
    `v0=${createHmac('sha256', s).update(`v0:${t}:${body}`).digest('hex')}`;
  assert.equal(validSlackSignature(secret, ts, raw, sign(secret), now), true);
  assert.equal(validSlackSignature(secret, ts, `${raw}x`, sign(secret), now), false);
  assert.equal(validSlackSignature(secret, ts, raw, sign('f'.repeat(32)), now), false);
  assert.equal(validSlackSignature('', ts, raw, sign(''), now), false);
  // Rejeu d'une requête vieille de dix minutes.
  const old = String(now / 1000 - 600);
  assert.equal(validSlackSignature(secret, old, raw, sign(secret, old), now), false);
});

test('texte Slack : caractères neutralisés, lien sans barre verticale parasite', () => {
  assert.equal(slackEscape('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
  assert.equal(
    slackLink('https://x.test/t/1', 'ETO-1 · A|B <v2>'),
    '<https://x.test/t/1|ETO-1 · A/B &lt;v2&gt;>',
  );
});
