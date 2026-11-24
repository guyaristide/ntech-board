import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import {
  categoryOf,
  FINDING_NATURES,
  FINDING_NATURE_LABEL,
  FINDING_SEVERITIES,
  FINDING_SEVERITY_LABEL,
  fileSize,
  type Campaign,
  type Finding,
  type FindingLink,
  type FindingNature,
  type FindingSeverity,
} from '@board/shared';
import { ApiError } from '../../model/api';
import { uploadFile } from '../../model/files';
import { findings as actions } from '../../model/findings';
import { useWorkspace } from '../../model/store';
import { noticeDialog } from '../../ui/Confirm';
import page from '../Page.module.css';
import { FindingLinks } from './FindingLinks';
import styles from './FindingReport.module.css';

const SEVERITY_HINT: Record<FindingSeverity, string> = {
  blocking: 'Empêche d’utiliser la fonction, sans contournement',
  major: 'Fonction dégradée, ou contournement pénible',
  minor: 'Gêne légère, contournement simple',
  cosmetic: 'Présentation, libellé, alignement',
};

interface Picked {
  key: string;
  file: File;
  error?: string;
  progress?: number;
  preview?: string;
}

/**
 * Signalement d'un retour de recette : description structurée, rattachement à un cas de test et à
 * d'autres éléments, captures jointes (bouton, glisser-déposer, ou collage d'une capture). Les
 * fichiers partent juste après la création du retour.
 */
export function ReportDialog({
  campaign,
  caseKey: initialCase = '',
  actual = '',
  onClose,
}: {
  campaign: Campaign;
  caseKey?: string;
  actual?: string;
  onClose: (created: Finding | null) => void;
}) {
  const stories = useWorkspace(s => s.stories);
  const fileSettings = useWorkspace(s => s.settings.files);
  const scope = campaign.scope.map(id => stories.find(s => s.id === id)).filter(s => !!s);
  const textOf = (key: string) => {
    const [sid, cid] = key.split(':');
    return scope.find(s => s.id === sid)?.acceptance.find(a => a.id === cid)?.text ?? '';
  };
  const [title, setTitle] = useState('');
  const [nature, setNature] = useState<FindingNature>('bug');
  const [severity, setSeverity] = useState<FindingSeverity>('major');
  const [caseKey, setCaseKey] = useState(initialCase);
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState(textOf(initialCase));
  const [seen, setSeen] = useState(actual);
  const [environment, setEnvironment] = useState('');
  const [related, setRelated] = useState<FindingLink[]>([]);
  const [files, setFiles] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const dirty = !!(title || steps || seen !== actual || files.length || related.length);

  // Échap ferme, sauf si une saisie serait perdue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !dirty && !busy && onClose(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, busy, onClose]);
  useEffect(() => () => files.forEach(f => f.preview && URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = (list: File[]) =>
    setFiles(current => [
      ...current,
      ...list.map(raw => {
        // Une capture collée s'appelle « image.png » : on la nomme d'après l'heure.
        const file =
          raw.name === 'image.png' || !raw.name
            ? new File([raw], `Capture ${new Date().toLocaleString('fr-FR').replace(/[/:]/g, '-')}.png`, {
                type: raw.type || 'image/png',
              })
            : raw;
        const cat = categoryOf(file.name);
        return {
          key: `${file.name}-${Math.random()}`,
          file,
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
          error:
            file.size > fileSettings.maxMb * 1024 * 1024
              ? `dépasse ${fileSettings.maxMb} Mo`
              : !cat || !fileSettings.categories.includes(cat)
                ? 'type non accepté dans ce projet'
                : undefined,
        };
      }),
    ]);
  const onPaste = (e: ClipboardEvent) => {
    const pasted = [...e.clipboardData.files];
    if (!pasted.length) return;
    e.preventDefault();
    addFiles(pasted);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    addFiles([...e.dataTransfer.files]);
  };
  const pickCase = (key: string) => {
    // L'attendu suit le cas choisi tant qu'il n'a pas été réécrit à la main.
    if (!expected || expected === textOf(caseKey)) setExpected(textOf(key));
    setCaseKey(key);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy('Enregistrement…');
    let created: Finding;
    try {
      created = await actions.create({
        campaign: campaign.id,
        caseKey,
        title: title.trim(),
        nature,
        severity,
        steps,
        expected,
        actual: seen,
        environment,
        related,
      });
    } catch (err) {
      setError(err instanceof ApiError ? (err.message ?? err.code) : 'Erreur réseau, réessayez.');
      setBusy('');
      return;
    }
    const sendable = files.filter(f => !f.error);
    let failed = 0;
    for (const [i, f] of sendable.entries()) {
      setBusy(`Envoi des fichiers (${i + 1}/${sendable.length})…`);
      await uploadFile({ kind: 'finding', id: created.id }, f.file, progress =>
        setFiles(list => list.map(x => (x.key === f.key ? { ...x, progress } : x))),
      ).catch(() => failed++);
    }
    if (failed)
      await noticeDialog(
        `Le retour ${created.id} est enregistré`,
        `${failed} fichier(s) n’ont pas pu être envoyés : ajoutez-les depuis sa fiche.`,
      );
    onClose(created);
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={e => e.target === e.currentTarget && !dirty && onClose(null)}
    >
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onSubmit={submit}
        onPaste={onPaste}
      >
        <header className={styles.header}>
          <div>
            <h2 id="report-title">Signaler un retour</h2>
            <p>{campaign.name}</p>
          </div>
          <button type="button" className={page.ghost} aria-label="Fermer" onClick={() => onClose(null)}>
            ✕
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.main}>
            <label className={styles.field}>
              <span>
                Titre <em>obligatoire</em>
              </span>
              <input
                className={styles.titleInput}
                value={title}
                required
                autoFocus
                maxLength={300}
                placeholder="Ce qui ne va pas, en une phrase"
                onChange={e => setTitle(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Pour reproduire</span>
              <textarea
                rows={5}
                value={steps}
                placeholder={'1. Ouvrir…\n2. Cliquer sur…\n3. …'}
                onChange={e => setSteps(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Résultat attendu</span>
              <textarea
                rows={3}
                value={expected}
                placeholder="Ce qui devait se passer"
                onChange={e => setExpected(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Résultat constaté</span>
              <textarea
                rows={3}
                value={seen}
                placeholder="Ce qui s’est passé à la place"
                onChange={e => setSeen(e.target.value)}
              />
            </label>

            <div className={styles.field}>
              <span>Captures et fichiers</span>
              <div
                className={styles.drop}
                data-over={over || undefined}
                onDragOver={e => {
                  e.preventDefault();
                  setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <button type="button" className={page.outline} onClick={() => input.current?.click()}>
                  + Ajouter des fichiers
                </button>
                <span>
                  ou glissez-les ici · Ctrl+V pour coller une capture · {fileSettings.maxMb} Mo au plus
                </span>
                <input
                  ref={input}
                  type="file"
                  multiple
                  hidden
                  onChange={e => {
                    addFiles([...(e.target.files ?? [])]);
                    e.target.value = '';
                  }}
                />
              </div>
              {files.length ? (
                <ul className={styles.files}>
                  {files.map(f => (
                    <li key={f.key} data-error={f.error ? true : undefined}>
                      {f.preview ? <img src={f.preview} alt="" /> : <i aria-hidden="true">📎</i>}
                      <span title={f.file.name}>{f.file.name}</span>
                      <small>
                        {f.error ??
                          (f.progress !== undefined
                            ? `${Math.round(f.progress * 100)} %`
                            : fileSize(f.file.size))}
                      </small>
                      <button
                        type="button"
                        aria-label={`Retirer ${f.file.name}`}
                        disabled={!!busy}
                        onClick={() => setFiles(list => list.filter(x => x.key !== f.key))}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <aside className={styles.side}>
            <label className={styles.field}>
              <span>Nature</span>
              <select value={nature} onChange={e => setNature(e.target.value as FindingNature)}>
                {FINDING_NATURES.map(n => (
                  <option key={n} value={n}>
                    {FINDING_NATURE_LABEL[n]}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.field} role="radiogroup" aria-label="Gravité">
              <span>Gravité</span>
              <div className={styles.severities}>
                {FINDING_SEVERITIES.map(s => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={severity === s}
                    data-severity={s}
                    title={SEVERITY_HINT[s]}
                    onClick={() => setSeverity(s)}
                  >
                    {FINDING_SEVERITY_LABEL[s]}
                  </button>
                ))}
              </div>
              <small>{SEVERITY_HINT[severity]}</small>
            </div>
            <label className={styles.field}>
              <span>Cas de test concerné</span>
              <select value={caseKey} onChange={e => pickCase(e.target.value)}>
                <option value="">Aucun (retour hors critère)</option>
                {scope.map(s => (
                  <optgroup key={s.id} label={`${s.id} · ${s.title}`}>
                    {s.acceptance.map(a => (
                      <option key={a.id} value={`${s.id}:${a.id}`}>
                        {a.text}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {caseKey ? <small>Le cas sera noté KO s’il n’a pas encore de résultat.</small> : null}
            </label>
            <label className={styles.field}>
              <span>Environnement</span>
              <input
                value={environment}
                maxLength={500}
                placeholder="Navigateur, appareil, compte de test…"
                onChange={e => setEnvironment(e.target.value)}
              />
            </label>
            <div className={styles.field}>
              <span>Éléments liés</span>
              <FindingLinks value={related} onChange={setRelated} />
              <small>Un ticket déjà ouvert, une US, un risque, un autre retour.</small>
            </div>
          </aside>
        </div>

        <footer className={styles.footer}>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : (
            <p>{busy || 'Le retour arrive « à qualifier » : l’équipe décide ensuite de sa correction.'}</p>
          )}
          <button type="button" className={page.outline} disabled={!!busy} onClick={() => onClose(null)}>
            Annuler
          </button>
          <button type="submit" className={page.primary} disabled={!!busy || !title.trim()}>
            Signaler le retour
          </button>
        </footer>
      </form>
    </div>
  );
}
