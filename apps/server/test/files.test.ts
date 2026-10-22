import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  categoryOf,
  DEFAULT_FILE_SETTINGS,
  folderFor,
  safeFileName,
  withSettingsDefaults,
} from '@board/shared';

process.env.SECRETS_KEY ??= 'clé de test';
// env.ts exige une base ; le chiffrement n'en a pas besoin.
process.env.DATABASE_URL ??= 'postgres://test@localhost/test';
const { decrypt, encrypt } = await import('../src/files/crypto');

const ctx = {
  project: 'etourisme',
  kind: 'story' as const,
  id: 'US-UC01-01',
  author: 'lead',
  date: new Date('2026-10-22T10:00:00Z'),
};

test('rangement des dossiers selon la stratégie', () => {
  const f = DEFAULT_FILE_SETTINGS;
  assert.equal(folderFor(f, ctx), 'ntech-board/etourisme/us/US-UC01-01');
  assert.equal(folderFor({ ...f, folders: 'date' }, ctx), 'ntech-board/etourisme/2026/10');
  assert.equal(folderFor({ ...f, folders: 'flat', root: '' }, ctx), 'etourisme');
  assert.equal(
    folderFor({ ...f, folders: 'custom', template: '{projet}/{auteur}/{annee}-{mois}-{jour}/../x' }, ctx),
    'ntech-board/etourisme/lead/2026-10-22/x',
  );
});

test('noms de fichiers sûrs et familles acceptées', () => {
  assert.equal(safeFileName('Capture d’écran 2026/10.png'), 'Capture-d-ecran-2026-10.png');
  assert.equal(safeFileName('../../etc/passwd'), 'etc-passwd');
  assert.equal(categoryOf('Rapport.PDF'), 'pdf');
  assert.equal(categoryOf('budget.xlsx'), 'office');
  assert.equal(categoryOf('logo.svg'), null);
  assert.equal(categoryOf('page.html'), null);
});

test('un nouveau projet garde le stockage local', () => {
  assert.equal(withSettingsDefaults({}).files.store, 'local');
  assert.equal(withSettingsDefaults({ files: { maxMb: 2 } as never }).files.folders, 'element');
});

test('les secrets sont chiffrés et relus', () => {
  const stored = encrypt('cle-secrete-minio');
  assert.ok(!stored.includes('cle-secrete'));
  assert.notEqual(encrypt('cle-secrete-minio'), stored);
  assert.equal(decrypt(stored), 'cle-secrete-minio');
  assert.throws(() => decrypt(stored.replace(/.$/, c => (c === 'A' ? 'B' : 'A'))));
});
