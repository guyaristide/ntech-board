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

test('MCP : un lot enchaîne les outils, simule sans écrire et s’arrête à la première erreur', async () => {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { z } = await import('zod');
  const { tool, toolsOf } = await import('../src/mcp/context');
  const { registerBatch } = await import('../src/mcp/batch');
  const server = new McpServer({ name: 'essai', version: '1' });
  const done: string[] = [];
  tool(
    server,
    'noter',
    { title: 'Noter', description: '', input: { texte: z.string().min(2) }, write: true },
    async a => {
      if (a.texte === 'refus') throw new Error('refusé');
      done.push(a.texte);
      return `noté ${a.texte}`;
    },
  );
  registerBatch(server);
  const lot = toolsOf(server).get('executer_lot')!.run as (a: unknown) => Promise<string>;
  const ops = (...texts: string[]) => texts.map(texte => ({ outil: 'noter', arguments: { texte } }));

  const dry = await lot({ operations: ops('un', 'x'), simuler: true, continuer_sur_erreur: false });
  assert.match(dry, /Simulation : 1 opération\(s\) valide\(s\), 1 en erreur/);
  assert.deepEqual(done, []);

  const stopped = await lot({
    operations: ops('un', 'refus', 'deux'),
    simuler: false,
    continuer_sur_erreur: false,
  });
  assert.match(stopped, /1 réussie\(s\), 1 en échec, 1 non exécutée\(s\)/);
  assert.deepEqual(done, ['un']);

  const nested = await lot({
    operations: [{ outil: 'executer_lot', arguments: {} }],
    simuler: false,
    continuer_sur_erreur: false,
  });
  assert.match(nested, /outil inconnu ou non autorisé/);
});
