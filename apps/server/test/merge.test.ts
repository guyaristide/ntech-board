import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Workshop } from '@board/shared';
import type { RawPlanning, RawWorkshop } from '../src/importers/planning';
import { carrySession, mergePlanning, workshopFromRaw } from '../src/merge';

const raw = (id: string, title: string, questions: string[]): RawWorkshop => ({
  id,
  title,
  phase: 'Semaine 1',
  objectives: [],
  questionnaire: '',
  raci: [],
  risks: [],
  deliverable: '',
  pv: '',
  prep: [],
  date: null,
  pvDue: null,
  deliverableDue: null,
  validationDue: null,
  pvStatus: 'Validé par Cybastion',
  agenda: [{ kind: 'session', code: `${id}.1` }],
  sessions: [
    {
      code: `${id}.1`,
      atelier: id,
      start: '09:00',
      end: '10:00',
      allDay: false,
      title: 'Compte et profils',
      content: '',
      owner: '',
      outcome: '',
      questions,
      added: false,
      cdc: '',
      refs: [],
      steps: [],
    },
  ],
});
const planning = (...workshops: RawWorkshop[]): RawPlanning => ({
  source: 'p.xlsx',
  references: [],
  workshops,
});

test('le statut de PV du classeur est normalisé', () => {
  assert.equal(workshopFromRaw(raw('J1', 'Cadrage', [])).pvStatus, 'Validé');
});

test('une réponse et un point ajouté survivent à un nouvel import', () => {
  const before = workshopFromRaw(raw('J2', 'Parcours touriste', ['Quelles données obligatoires ?']));
  const answered: Workshop = {
    ...before,
    notes: [{ id: 'n', type: 'p', text: 'Synthèse' }],
    sessions: before.sessions.map(s => ({
      ...s,
      notes: [{ id: 'b', type: 'p', text: 'dit en séance' }],
      questions: [
        { ...s.questions[0], answer: 'Nom et e-mail', status: 'Tranché' },
        { id: 'c', text: 'Connexion Apple ?', answer: '', status: 'Ouvert', custom: true },
      ],
    })),
  };
  const { workshops } = mergePlanning(
    [answered],
    planning(raw('J2', 'Parcours touriste', ['Quelles  données obligatoires ?', 'Nouveau point'])),
  );
  const s = workshops[0].sessions[0];
  assert.deepEqual(
    s.questions.map(q => [q.text, q.answer, q.status]),
    [
      ['Quelles  données obligatoires ?', 'Nom et e-mail', 'Tranché'],
      ['Nouveau point', '', 'Ouvert'],
      ['Connexion Apple ?', '', 'Ouvert'],
    ],
  );
  assert.equal(s.notes[0].text, 'dit en séance');
  assert.equal(workshops[0].notes[0].text, 'Synthèse');
});

test('un atelier enrichi qui change de sujet est archivé, pas perdu', () => {
  const before = {
    ...workshopFromRaw(raw('J4', 'Fiscalité', [])),
    notes: [{ id: 'n', type: 'p' as const, text: 'DGI' }],
  };
  const { workshops, orphaned } = mergePlanning([before], planning(raw('J4', 'Parcours opérateur', [])));
  assert.equal(orphaned, 1);
  assert.deepEqual(
    workshops.map(w => w.id),
    ['J4', 'ancien-J4'],
  );
  assert.equal(workshops[0].notes.length, 0);
});

test('un point retiré du planning et non traité disparaît', () => {
  const before = workshopFromRaw(raw('J1', 'Cadrage', ['Ancien point']));
  const next = workshopFromRaw(raw('J1', 'Cadrage', []));
  assert.equal(carrySession(next.sessions[0], before.sessions[0]).questions.length, 0);
});

test('un atelier géré dans l’outil est conservé, et le classeur ne le remplace pas', () => {
  const mine: Workshop = {
    ...workshopFromRaw(raw('J2', 'Parcours touriste revu', [])),
    custom: true,
    title: 'Parcours touriste revu',
  };
  const created: Workshop = { ...workshopFromRaw(raw('J10', 'Atelier ajouté', [])), custom: true };
  const { workshops, custom } = mergePlanning(
    [mine, created],
    planning(raw('J2', 'Parcours touriste', ['Q'])),
  );
  assert.equal(custom, 2);
  assert.deepEqual(workshops.map(w => w.id).sort(), ['J10', 'J2']);
  assert.equal(workshops.find(w => w.id === 'J2')?.title, 'Parcours touriste revu');
});
