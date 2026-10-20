import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canSeeDelivery,
  DEFAULT_SETTINGS,
  mentionsOf,
  newParty,
  partyNames,
  splitMention,
  withSettingsDefaults,
  type Diligence,
  type Phase,
  type Risk,
  type Workshop,
} from '@board/shared';

const parties = [
  newParty('ORG-01', 'organization', { name: 'Ministère du Tourisme et des Loisirs', short: 'MTL' }),
  newParty('ORG-02', 'organization', { name: 'Cybastion' }),
  newParty('ROL-01', 'role', { name: 'Lead Chef de projet', aliases: ['Lead CP'], organization: 'ORG-03' }),
  newParty('PER-01', 'person', { name: 'A. Kouassi', organization: 'ORG-02', userId: 'u-cyb' }),
];

test('une mention composée est découpée, sauf quand la suite prolonge le nom', () => {
  assert.deepEqual(splitMention('Cybastion et Lead Chef de projet'), ['Cybastion', 'Lead Chef de projet']);
  assert.deepEqual(splitMention('Ministère du Tourisme et des Loisirs'), [
    'Ministère du Tourisme et des Loisirs',
  ]);
  assert.deepEqual(splitMention('NTECH SARL, agrégateur'), ['NTECH SARL', 'agrégateur']);
  assert.deepEqual(splitMention('Responsable IA (Hassan)'), ['Responsable IA (Hassan)']);
});

test('les mentions sont rapprochées par nom, sigle et alias ; les valeurs d’attente sont ignorées', () => {
  const phase = { id: 'P2', actors: [{ id: 'mtl', name: 'MTL' }] } as Phase;
  const risk = {
    id: 'R04',
    owner: 'lead cp',
    actionOwner: 'À désigner',
    authority: '',
    actions: [],
  } as unknown as Risk;
  const diligence = { id: 'D01', owner: 'SIVIS', partners: '' } as Diligence;
  const workshop = {
    id: 'J1',
    sessions: [{ code: 'J1.1', owner: 'Cybastion et Lead Chef de projet' }],
  } as unknown as Workshop;
  const found = mentionsOf(
    { phases: [phase], risks: [risk], diligences: [diligence], workshops: [workshop] },
    parties,
  );
  const by = new Map(found.map(m => [m.text, m]));
  assert.equal(by.get('MTL')?.party?.id, 'ORG-01');
  assert.equal(by.get('lead cp')?.party?.id, 'ROL-01');
  assert.equal(by.get('Lead Chef de projet')?.party?.id, 'ROL-01');
  assert.equal(by.get('Cybastion')?.party?.id, 'ORG-02');
  assert.equal(by.get('SIVIS')?.party, null);
  assert.ok(!by.has('À désigner'));
  assert.equal(by.get('SIVIS')?.places[0].path, '/diligence/D01');
});

test('les listes de choix proposent le référentiel puis les autres valeurs, sans doublon', () => {
  const names = partyNames(parties, ['Lead CP', 'SIVIS', 'À désigner', '']);
  assert.deepEqual(names.slice(-1), ['SIVIS']);
  assert.ok(!names.includes('Lead CP'));
  assert.ok(!names.includes('À désigner'));
});

test('visibilité de la partie Réalisation', () => {
  const off = DEFAULT_SETTINGS;
  assert.equal(canSeeDelivery(off, { role: 'admin', userId: 'u1' }, parties), false);
  const on = withSettingsDefaults({
    delivery: {
      ...DEFAULT_SETTINGS.delivery,
      enabled: true,
      visibility: { roles: ['editor'], organizations: ['ORG-02'], allow: ['u-ok'], deny: ['u-no'] },
    },
  });
  assert.equal(canSeeDelivery(on, { role: 'admin', userId: 'u1' }, parties), true);
  assert.equal(canSeeDelivery(on, { role: 'editor', userId: 'u2' }, parties), true);
  assert.equal(canSeeDelivery(on, { role: 'editor', userId: 'u-no' }, parties), false);
  assert.equal(canSeeDelivery(on, { role: 'viewer', userId: 'u2' }, parties), false);
  assert.equal(canSeeDelivery(on, { role: 'viewer', userId: 'u-cyb' }, parties), true);
  assert.equal(canSeeDelivery(on, { role: 'viewer', userId: 'u-ok' }, parties), true);
  assert.equal(canSeeDelivery(on, { role: null, userId: 'u-ok' }, parties), false);
});

test('les réglages enregistrés sont complétés des valeurs par défaut', () => {
  const s = withSettingsDefaults({ delivery: { enabled: true } as never });
  assert.equal(s.delivery.enabled, true);
  assert.equal(s.delivery.sprintWeeks, 2);
  assert.deepEqual(s.delivery.visibility.roles, ['admin', 'editor', 'viewer']);
  assert.ok(s.organizationTypes.length > 0);
});
