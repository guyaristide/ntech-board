import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  FILE_CATEGORIES,
  FILE_CATEGORY_KEYS,
  fileSize,
  FOLDER_PLACEHOLDERS,
  FOLDER_STRATEGIES,
  folderFor,
  MAX_FILE_MB,
  type FileSettings,
  type FolderStrategy,
  type ProjectSettings,
} from '@board/shared';
import { storage, type StorageState } from '../../model/files';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import { providerLabel, StorageBackends } from './StorageBackends';
import base from './Parties.module.css';
import own from './Storage.module.css';

const styles = { ...base, ...own };

type Props = { draft: ProjectSettings; setDraft: Dispatch<SetStateAction<ProjectSettings>> };

/**
 * Pièces jointes : stockage des nouveaux fichiers, rangement en dossiers, taille et types acceptés
 * (enregistrés avec les autres réglages), puis les stockages configurés (enregistrés tout de suite).
 */
export function SettingsFiles({ draft, setDraft }: Props) {
  const slug = useWorkspace(s => s.session?.project.slug ?? 'projet');
  const saved = useWorkspace(s => s.settings.files);
  const [state, setState] = useState<StorageState | null>(null);
  const [moving, setMoving] = useState('');
  const reload = () => storage.load().then(setState, () => setState(null));
  useEffect(() => void reload(), []);
  const f = draft.files;
  const set = (patch: Partial<FileSettings>) => setDraft(s => ({ ...s, files: { ...s.files, ...patch } }));
  const example = `${folderFor(f, { project: slug, kind: 'story', id: 'US-UC01-01', author: 'prenom.nom' })}/capture.png`;
  const elsewhere = state
    ? (saved.store === 'local' ? 0 : state.local.files) +
      state.backends.filter(b => b.id !== saved.store).reduce((n, b) => n + b.files, 0)
    : 0;

  const migrate = async () => {
    setMoving('Transfert en cours…');
    let total = 0;
    const errors: string[] = [];
    for (;;) {
      try {
        const r = await storage.migrate();
        total += r.moved;
        errors.push(...r.errors);
        setMoving(`${total} fichier(s) transféré(s), ${r.remaining} restant(s)…`);
        if (!r.remaining || !r.moved) break;
      } catch {
        errors.push('Erreur réseau.');
        break;
      }
    }
    setMoving(
      `${total} fichier(s) transféré(s).${errors.length ? ` Échecs : ${[...new Set(errors)].slice(0, 3).join(' ; ')}` : ''}`,
    );
    void reload();
  };

  return (
    <>
      <section className={styles.section}>
        <h2 className={page.h2}>Fichiers et pièces jointes</h2>
        <p className={styles.hint}>
          Captures, PDF, tableurs, vidéos… se joignent aux US, ateliers, risques, tickets et autres éléments.
          Chaque fichier reste dans le stockage où il a été déposé ; changer de stockage vaut pour les
          nouveaux fichiers, et les anciens peuvent y être transférés.
        </p>
        <div className={styles.fields}>
          <label htmlFor="files-store">Stockage des nouveaux fichiers</label>
          <div>
            <select id="files-store" value={f.store} onChange={e => set({ store: e.target.value })}>
              <option value="local">
                Serveur de l’application{state ? ` · ${state.local.files} fichier(s)` : ''}
              </option>
              {state?.backends.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({providerLabel(b)}) · {b.files} fichier(s)
                </option>
              ))}
            </select>
            {elsewhere && f.store === saved.store ? (
              <p className={styles.hint}>
                {elsewhere} fichier(s) sont dans un autre stockage.{' '}
                <button
                  type="button"
                  className={page.ghost}
                  disabled={!!moving && moving.endsWith('…')}
                  onClick={() => void migrate()}
                >
                  Les transférer vers le stockage actif
                </button>
              </p>
            ) : null}
            {moving ? <p className={styles.hint}>{moving}</p> : null}
          </div>

          <label htmlFor="files-root">Dossier racine</label>
          <div>
            <input
              id="files-root"
              type="text"
              value={f.root}
              placeholder="ntech-board"
              onChange={e => set({ root: e.target.value.replace(/[^\w./-]/g, '') })}
            />
            <p className={styles.hint}>Préfixe de tous les fichiers du projet dans le stockage.</p>
          </div>

          <label htmlFor="files-folders">Rangement des dossiers</label>
          <div>
            <select
              id="files-folders"
              value={f.folders}
              onChange={e => set({ folders: e.target.value as FolderStrategy })}
            >
              {Object.entries(FOLDER_STRATEGIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.template})
                </option>
              ))}
              <option value="custom">Modèle personnalisé</option>
            </select>
            {f.folders === 'custom' ? (
              <input
                type="text"
                aria-label="Modèle de dossier"
                className={styles.template}
                value={f.template}
                onChange={e => set({ template: e.target.value.replace(/[^\w{}./-]/g, '') })}
              />
            ) : null}
            <p className={styles.hint}>
              Exemple : <code>{example}</code>
              {f.folders === 'custom' ? <> · Variables : {FOLDER_PLACEHOLDERS.join(' ')}</> : null}
            </p>
          </div>

          <label htmlFor="files-max">Taille maximale</label>
          <div>
            <input
              id="files-max"
              type="number"
              min={0.5}
              max={MAX_FILE_MB}
              step={0.5}
              value={f.maxMb}
              onChange={e =>
                set({ maxMb: Math.min(MAX_FILE_MB, Math.max(0.5, Number(e.target.value) || MAX_FILE_MB)) })
              }
            />{' '}
            Mo par fichier <span className={page.faint}>(au plus {MAX_FILE_MB} Mo)</span>
          </div>

          <span className={styles.fieldLabel}>Types acceptés</span>
          <span className={styles.checks}>
            {FILE_CATEGORY_KEYS.map(c => (
              <label key={c} title={FILE_CATEGORIES[c].ext.join(', ')}>
                <input
                  type="checkbox"
                  checked={f.categories.includes(c)}
                  onChange={e =>
                    set({
                      categories: e.target.checked ? [...f.categories, c] : f.categories.filter(x => x !== c),
                    })
                  }
                />
                {FILE_CATEGORIES[c].label}
              </label>
            ))}
          </span>
        </div>
      </section>

      <StorageBackends
        state={state}
        active={saved.store}
        reload={reload}
        usage={state ? `${state.local.files} fichier(s), ${fileSize(state.local.bytes)}` : ''}
      />
    </>
  );
}
