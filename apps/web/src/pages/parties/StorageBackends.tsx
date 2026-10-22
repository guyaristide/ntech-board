import { useState } from 'react';
import {
  fileSize,
  S3_FLAVORS,
  type S3Flavor,
  type StorageBackendView,
  type StorageProvider,
} from '@board/shared';
import { ApiError } from '../../model/api';
import { storage, type BackendInput, type StorageState } from '../../model/files';
import page from '../Page.module.css';
import base from './Parties.module.css';
import own from './Storage.module.css';

const styles = { ...base, ...own };

export const providerLabel = (b: StorageBackendView) =>
  b.provider === 'cloudinary'
    ? 'Cloudinary'
    : (S3_FLAVORS[b.config.flavor as S3Flavor]?.label ?? 'Compatible S3');

type Kind = 'cloudinary' | S3Flavor;
const KINDS: [Kind, string][] = [
  ['cloudinary', 'Cloudinary'],
  ['minio', 'MinIO'],
  ['aws', 'Amazon S3'],
  ['other', 'Autre service S3'],
];

interface Draft {
  id: string | null;
  kind: Kind;
  name: string;
  config: Record<string, string | boolean>;
  secret: string;
  delivery: 'proxy' | 'direct';
}

const blank = (kind: Kind): Draft => ({
  id: null,
  kind,
  name: KINDS.find(k => k[0] === kind)![1],
  config:
    kind === 'cloudinary'
      ? { cloudName: '', apiKey: '' }
      : {
          flavor: kind,
          endpoint: kind === 'minio' ? 'https://' : '',
          region: S3_FLAVORS[kind].region,
          bucket: '',
          accessKeyId: '',
          pathStyle: S3_FLAVORS[kind].pathStyle,
        },
  secret: '',
  delivery: 'proxy',
});

/** Champs de chaque fournisseur : [clé, libellé, aide]. */
const FIELDS: Record<'cloudinary' | 's3', [string, string, string][]> = {
  cloudinary: [
    ['cloudName', 'Cloud name', 'Tableau de bord Cloudinary › Product environment'],
    ['apiKey', 'API key', ''],
  ],
  s3: [
    ['endpoint', 'Adresse du service', 'MinIO : https://minio.exemple.com ; vide pour Amazon S3'],
    ['region', 'Région', 'Amazon : eu-west-3 (Paris)… ; MinIO : us-east-1'],
    ['bucket', 'Bucket', 'À créer d’abord dans le service'],
    ['accessKeyId', 'Access key', ''],
  ],
};

/** Stockages configurés du projet : ajout, modification, essai, suppression. Enregistrés tout de suite. */
export function StorageBackends({
  state,
  active,
  reload,
  usage,
}: {
  state: StorageState | null;
  active: string;
  reload: () => Promise<void> | void;
  usage: string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const note = (id: string, text: string) => setNotes(n => ({ ...n, [id]: text }));
  const provider: StorageProvider = draft?.kind === 'cloudinary' ? 'cloudinary' : 's3';

  const edit = (b: StorageBackendView) =>
    setDraft({
      id: b.id,
      kind: b.provider === 'cloudinary' ? 'cloudinary' : ((b.config.flavor as S3Flavor) ?? 'other'),
      name: b.name,
      config: { ...b.config },
      secret: '',
      delivery: b.delivery,
    });
  const save = async () => {
    if (!draft) return;
    setError('');
    const input: BackendInput = {
      provider,
      name: draft.name.trim() || 'Stockage',
      config: draft.config,
      delivery: draft.delivery,
      ...(draft.secret ? { secret: draft.secret } : {}),
    };
    try {
      const id = draft.id ?? (await storage.create(input)).id;
      if (draft.id) await storage.update(draft.id, input);
      setDraft(null);
      await reload();
      await test(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur réseau, réessayez.');
    }
  };
  const test = async (id: string) => {
    note(id, 'Essai en cours…');
    const r = await storage.test(id).catch(() => ({ ok: false, message: 'erreur réseau' }) as const);
    note(id, r.ok ? `Connexion réussie : fichier d’essai déposé, relu et supprimé.` : `Échec : ${r.message}`);
  };
  const remove = async (b: StorageBackendView) => {
    if (!confirm(`Supprimer le stockage « ${b.name} » ? Ses clés seront effacées du tableau.`)) return;
    try {
      await storage.remove(b.id);
      await reload();
    } catch (e) {
      note(b.id, e instanceof ApiError ? e.message : 'Suppression impossible.');
    }
  };

  return (
    <section className={styles.section}>
      <h2 className={page.h2}>Stockages</h2>
      {state && !state.canEncrypt ? (
        <p className={styles.warn}>
          Le serveur n’a pas de clé de chiffrement (variable SECRETS_KEY) : les clés d’accès ne peuvent pas
          être enregistrées. Seul le serveur de l’application est utilisable.
        </p>
      ) : null}
      <ul className={styles.stores}>
        <li>
          <span>
            <strong>Serveur de l’application</strong>
            {active === 'local' ? <span className={styles.active}>Actif</span> : null}
          </span>
          <span className={page.faint}>Toujours disponible · {usage}</span>
        </li>
        {state?.backends.map(b => (
          <li key={b.id}>
            <span>
              <strong>{b.name}</strong> <span className={page.faint}>· {providerLabel(b)}</span>
              {active === b.id ? <span className={styles.active}>Actif</span> : null}
            </span>
            <span className={page.faint}>
              {b.provider === 'cloudinary'
                ? `Cloud ${b.config.cloudName}`
                : `${b.config.endpoint || 'Amazon S3'} › ${b.config.bucket}`}{' '}
              · {b.files} fichier(s), {fileSize(b.bytes)} ·{' '}
              {b.delivery === 'direct' ? 'liens directs signés' : 'téléchargement par le serveur'}
              {b.hasSecret ? '' : ' · clé secrète manquante'}
            </span>
            <span className={page.actions}>
              <button type="button" className={page.ghost} onClick={() => void test(b.id)}>
                Tester
              </button>
              <button type="button" className={page.ghost} onClick={() => edit(b)}>
                Modifier
              </button>
              <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void remove(b)}>
                Supprimer
              </button>
            </span>
            {notes[b.id] ? <span className={styles.hint}>{notes[b.id]}</span> : null}
          </li>
        ))}
      </ul>

      {!draft ? (
        <p className={page.actions}>
          {KINDS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={page.ghost}
              disabled={state ? !state.canEncrypt : true}
              onClick={() => setDraft(blank(k))}
            >
              + {label}
            </button>
          ))}
        </p>
      ) : (
        <div className={styles.storeForm}>
          <strong>
            {draft.id
              ? `Modifier « ${draft.name} »`
              : `Nouveau stockage ${KINDS.find(k => k[0] === draft.kind)![1]}`}
          </strong>
          <div className={styles.fields}>
            <label htmlFor="store-name">Nom</label>
            <input
              id="store-name"
              type="text"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />
            {FIELDS[provider].map(([key, label, help]) => (
              <FieldRow key={key} id={`store-${key}`} label={label} help={help}>
                <input
                  id={`store-${key}`}
                  type="text"
                  autoComplete="off"
                  value={String(draft.config[key] ?? '')}
                  onChange={e => setDraft({ ...draft, config: { ...draft.config, [key]: e.target.value } })}
                />
              </FieldRow>
            ))}
            <FieldRow
              id="store-secret"
              label={provider === 'cloudinary' ? 'API secret' : 'Secret key'}
              help={
                draft.id
                  ? 'Laisser vide pour garder la clé enregistrée.'
                  : 'Chiffrée sur le serveur ; jamais réaffichée.'
              }
            >
              <input
                id="store-secret"
                type="password"
                autoComplete="new-password"
                value={draft.secret}
                placeholder={draft.id ? '••••••••' : ''}
                onChange={e => setDraft({ ...draft, secret: e.target.value })}
              />
            </FieldRow>
            {provider === 's3' ? (
              <>
                <span className={styles.fieldLabel}>Adressage</span>
                <label className={styles.checks}>
                  <input
                    type="checkbox"
                    checked={draft.config.pathStyle !== false}
                    onChange={e =>
                      setDraft({ ...draft, config: { ...draft.config, pathStyle: e.target.checked } })
                    }
                  />
                  Bucket dans le chemin (MinIO et la plupart des services S3)
                </label>
              </>
            ) : null}
            <label htmlFor="store-delivery">Téléchargement</label>
            <select
              id="store-delivery"
              value={draft.delivery}
              onChange={e => setDraft({ ...draft, delivery: e.target.value as Draft['delivery'] })}
            >
              <option value="proxy">Par le serveur de l’application (toujours possible)</option>
              <option value="direct">Lien direct signé vers le stockage (5 minutes)</option>
            </select>
          </div>
          {error ? <p className={styles.warn}>{error}</p> : null}
          <p className={page.actions}>
            <button type="button" className={page.ghost} onClick={() => setDraft(null)}>
              Annuler
            </button>
            <button type="button" className={page.primary} onClick={() => void save()}>
              Enregistrer et tester
            </button>
          </p>
        </div>
      )}
    </section>
  );
}

function FieldRow({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div>
        {children}
        {help ? <p className={styles.hint}>{help}</p> : null}
      </div>
    </>
  );
}
