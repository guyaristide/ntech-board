import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyProposal, changedFields, cleanTranscript, quoteFound, type Reference } from '@board/shared';

// env.ts exige une base ; l'analyse n'en a pas besoin.
process.env.DATABASE_URL ??= 'postgres://test@localhost/test';
const { keep } = await import('../src/ai/extract');

const ref = (id: string, patch: Partial<Reference> = {}): Reference => ({
  id,
  subject: 'Paiement mobile',
  says: ['Paiement par Mobile Money', 'Reçu envoyé par SMS'],
  where: 'CdC § 4.2',
  gaps: '',
  sessions: [],
  ...patch,
});

const TEXT = `Marie : Pour le paiement, on garde Mobile Money mais on ajoute la carte bancaire dès la V1.
Paul : D’accord… et le reçu part par e-mail, plus par SMS.`;

test('citation retrouvée malgré casse, accents, apostrophes et espaces', () => {
  assert.ok(quoteFound(TEXT, 'on ajoute la carte bancaire dès la V1'));
  assert.ok(quoteFound(TEXT, "PAUL : d'accord...  et le reçu part par e-mail"));
  assert.ok(quoteFound(TEXT, 'on garde Mobile Money ... le reçu part par e-mail'));
});

test('citation inventée, trop courte ou dans le désordre : écartée', () => {
  assert.equal(quoteFound(TEXT, 'on supprime Mobile Money'), false);
  assert.equal(quoteFound(TEXT, 'Mobile'), false);
  assert.equal(quoteFound(TEXT, 'le reçu part par e-mail ... on garde Mobile Money'), false);
});

test('seuls les champs remplis et différents sont retenus', () => {
  const r = ref('R01');
  assert.deepEqual(changedFields(r, { subject: 'Paiement mobile', says: [], where: '', gaps: '  ' }), {});
  assert.deepEqual(changedFields(r, { gaps: 'Carte bancaire en V1 ?', says: [' a ', ''] }), {
    gaps: 'Carte bancaire en V1 ?',
    says: ['a'],
  });
});

test('accepter : la fiche prend les champs et garde la trace de l’échange', () => {
  const r = ref('R01', { sources: [{ source: 'SRC-01', quote: 'ancienne', at: '2026-11-01' }] });
  const next = applyProposal(
    r,
    { source: 'SRC-02', quote: 'le reçu part par e-mail', fields: { gaps: 'SMS ou e-mail ?' } },
    '2026-11-18',
  );
  assert.equal(next.gaps, 'SMS ou e-mail ?');
  assert.deepEqual(next.says, r.says);
  assert.deepEqual(
    next.sources?.map(s => s.source),
    ['SRC-01', 'SRC-02'],
  );
  const created = applyProposal(
    null,
    { source: 'SRC-02', quote: 'q', fields: { subject: 'Reçus' } },
    '2026-11-18',
  );
  assert.equal(created.subject, 'Reçus');
  assert.deepEqual(created.sessions, []);
});

test('tri des propositions de l’IA : citation, fiche visée, changement réel, doublons', () => {
  const refs = [ref('R01')];
  const base = { subject: '', says: [], where: '', gaps: '', rationale: 'r', confidence: 'high' as const };
  const out = keep(
    [
      {
        ...base,
        action: 'update',
        target: 'R01',
        gaps: 'Carte bancaire en V1',
        quote: 'on ajoute la carte bancaire dès la V1',
      },
      {
        ...base,
        action: 'update',
        target: 'R01',
        gaps: 'Carte bancaire en V1',
        quote: 'on ajoute la carte bancaire dès la V1',
      },
      { ...base, action: 'update', target: 'R99', gaps: 'x', quote: 'on ajoute la carte bancaire dès la V1' },
      { ...base, action: 'update', target: 'R01', gaps: 'y', quote: 'citation qui n’existe pas du tout' },
      {
        ...base,
        action: 'update',
        target: 'R01',
        subject: 'Paiement mobile',
        quote: 'on ajoute la carte bancaire dès la V1',
      },
      { ...base, action: 'create', target: '', says: ['Reçu par e-mail'], quote: 'le reçu part par e-mail' },
      {
        ...base,
        action: 'create',
        target: '',
        subject: 'Reçus',
        says: ['Reçu par e-mail'],
        quote: 'le reçu part par e-mail, plus par SMS',
      },
    ],
    refs,
    TEXT,
  );
  assert.deepEqual(
    out.map(p => [p.kind, p.target, Object.keys(p.fields).join(',')]),
    [
      ['reference.update', 'R01', 'gaps'],
      ['reference.create', '', 'subject,says'],
    ],
  );
});

test('sous-titres : horodatages et numéros retirés', () => {
  const vtt =
    'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nMarie : bonjour\n\n2\n00:00:05.000 --> 00:00:07.000\nPaul : on commence';
  assert.equal(cleanTranscript('reunion.vtt', vtt), 'Marie : bonjour\n\nPaul : on commence');
  assert.equal(cleanTranscript('notes.txt', '  12\n texte '), '12\n texte');
});
