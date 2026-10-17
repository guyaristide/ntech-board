import assert from 'node:assert/strict';
import { test } from 'node:test';
import { featureGroup, type Story } from '@board/shared';
import { enrichStory, symmetricLinks } from '../src/merge';

const story = (id: string, patch: Partial<Story> = {}): Story => ({
  id,
  epic: 'UC01',
  title: id,
  description: '',
  targets: [],
  links: [],
  actor: 'Touriste',
  asA: '',
  iWant: '',
  soThat: '',
  acceptance: [],
  scenario: 'nominal',
  source: '',
  version: 'MVP',
  workshop: 'J2',
  priority: 'Must',
  derived: false,
  status: 'À cadrer',
  body: [],
  comments: [],
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  ...patch,
});

test('un complément ne remplace ni la description ni les plateformes déjà saisies', () => {
  const current = story('US-UC01-01', {
    description: 'Saisie en atelier',
    targets: [{ platform: 'Portail', module: 'Compte' }],
  });
  const next = enrichStory(current, {
    id: current.id,
    description: 'Proposée par le fichier',
    targets: [{ platform: 'App mobile', module: 'Compte' }],
  });
  assert.equal(next, null);
});

test('un complément remplit ce qui est vide et ajoute les liaisons sans doublon', () => {
  const current = story('US-UC01-01', { links: [{ story: 'US-EX11-01', type: 'related' }] });
  const next = enrichStory(current, {
    id: current.id,
    description: 'Inscription par e-mail ou téléphone',
    targets: [
      { platform: 'Portail', module: 'Compte' },
      { platform: 'Portail', module: 'Compte' },
    ],
    links: [
      { story: 'US-EX11-01', type: 'same' },
      { story: 'US-EX21-01', type: 'same' },
      { story: 'US-UC01-01', type: 'same' },
    ],
  });
  assert.ok(next);
  assert.equal(next.description, 'Inscription par e-mail ou téléphone');
  assert.deepEqual(next.targets, [{ platform: 'Portail', module: 'Compte' }]);
  // La liaison déjà posée garde sa nature ; une US ne se lie pas à elle-même.
  assert.deepEqual(next.links, [
    { story: 'US-EX11-01', type: 'related' },
    { story: 'US-EX21-01', type: 'same' },
  ]);
});

test('une US enregistrée avant les liaisons est complétée sans erreur', () => {
  const legacy = { ...story('US-UC02-01') } as Partial<Story>;
  delete legacy.description;
  delete legacy.targets;
  delete legacy.links;
  const next = enrichStory(legacy as Story, { id: 'US-UC02-01', targets: [{ platform: 'PMS', module: '' }] });
  assert.deepEqual(next?.targets, [{ platform: 'PMS', module: '' }]);
  assert.deepEqual(next?.links, []);
});

test('les liaisons du fichier sont posées des deux côtés, avec la nature inverse', () => {
  const links = symmetricLinks([
    { id: 'US-UC12-08', links: [{ story: 'US-EX08-01', type: 'dependsOn' }] },
    { id: 'US-UC01-12', links: [{ story: 'US-EX11-02', type: 'same' }] },
  ]);
  assert.deepEqual(links.get('US-EX08-01'), [{ story: 'US-UC12-08', type: 'requiredBy' }]);
  assert.deepEqual(links.get('US-EX11-02'), [{ story: 'US-UC01-12', type: 'same' }]);
});

test('le groupe de fonctionnalité suit les liaisons de proche en proche, pas les dépendances', () => {
  const stories = [
    story('A', { links: [{ story: 'B', type: 'same' }] }),
    story('B', {
      links: [
        { story: 'A', type: 'same' },
        { story: 'C', type: 'duplicate' },
        { story: 'D', type: 'dependsOn' },
      ],
    }),
    story('C', { links: [{ story: 'B', type: 'duplicate' }] }),
    story('D', { links: [{ story: 'B', type: 'requiredBy' }] }),
  ];
  assert.deepEqual(featureGroup(stories, 'A').sort(), ['B', 'C']);
  assert.deepEqual(featureGroup(stories, 'D'), []);
});
