import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import {
  categoryOf,
  FILE_CATEGORIES,
  fileSize,
  previewable,
  type AttachableKind,
  type Attachment,
  type FileCategory,
} from '@board/shared';
import { ApiError } from '../model/api';
import { deleteAttachment, fileUrl, uploadFile } from '../model/files';
import { useCanEdit, useWorkspace } from '../model/store';
import styles from './Attachments.module.css';

const ICON: Record<FileCategory, string> = {
  images: '🖼️',
  pdf: '📕',
  office: '📄',
  video: '🎬',
  audio: '🎵',
  archives: '🗜️',
};
const officeIcon = (name: string) =>
  /\.(xlsx?|ods|csv)$/i.test(name) ? '📊' : /\.(pptx?|odp)$/i.test(name) ? '📽️' : '📄';
const iconOf = (a: Attachment) => {
  const cat = categoryOf(a.name);
  return cat === 'office' ? officeIcon(a.name) : cat ? ICON[cat] : '📎';
};
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

/**
 * Pièces jointes d'un élément : liste avec aperçus, ajout par bouton, glisser-déposer ou collage
 * d'une capture (Ctrl+V dans la zone), suppression. Taille et types selon les réglages du projet.
 */
export function Attachments({ kind, id }: { kind: AttachableKind; id: string }) {
  const canEdit = useCanEdit();
  const settings = useWorkspace(s => s.settings.files);
  const all = useWorkspace(s => s.attachments);
  const items = all
    .filter(a => a.owner.kind === kind && a.owner.id === id)
    .sort((a, b) => a.at.localeCompare(b.at));
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const accept = settings.categories.flatMap(c => FILE_CATEGORIES[c].ext.map(e => `.${e}`)).join(',');

  const patch = (key: string, p: Partial<Pending>) =>
    setPending(list => list.map(x => (x.key === key ? { ...x, ...p } : x)));
  const add = (files: File[]) => {
    for (const raw of files) {
      // Une capture collée s'appelle souvent « image.png » : on la nomme d'après l'heure.
      const file =
        raw.name === 'image.png' || !raw.name
          ? new File([raw], `Capture ${new Date().toLocaleString('fr-FR').replace(/[/:]/g, '-')}.png`, {
              type: raw.type || 'image/png',
            })
          : raw;
      const key = `${file.name}-${Math.random()}`;
      const cat = categoryOf(file.name);
      const error =
        file.size > settings.maxMb * 1024 * 1024
          ? `dépasse ${settings.maxMb} Mo (${fileSize(file.size)})`
          : !cat || !settings.categories.includes(cat)
            ? 'type de fichier non accepté dans ce projet'
            : undefined;
      setPending(list => [...list, { key, name: file.name, progress: 0, error }]);
      if (error) continue;
      uploadFile({ kind, id }, file, progress => patch(key, { progress })).then(
        () => setPending(list => list.filter(x => x.key !== key)),
        e => patch(key, { error: e instanceof ApiError ? e.message : 'envoi impossible' }),
      );
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (canEdit) add([...e.dataTransfer.files]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files];
    if (!canEdit || !files.length) return;
    e.preventDefault();
    add(files);
  };
  const open = (a: Attachment) => {
    if (a.mime.startsWith('image/') && previewable(a.mime)) setViewing(a);
    else window.open(fileUrl(a, previewable(a.mime)), '_blank', 'noopener');
  };
  const remove = (a: Attachment) => confirm(`Supprimer « ${a.name} » ?`) && void deleteAttachment(a.id);

  if (!canEdit && !items.length) return <p className={styles.none}>Aucune pièce jointe.</p>;

  return (
    <div
      className={styles.root}
      data-over={over || undefined}
      tabIndex={canEdit ? 0 : undefined}
      onPaste={onPaste}
      onDragOver={e => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      aria-label="Pièces jointes"
    >
      {items.length ? (
        <ul className={styles.list}>
          {items.map(a => (
            <li key={a.id} className={styles.item}>
              <button
                type="button"
                className={styles.thumb}
                onClick={() => open(a)}
                title={`Ouvrir ${a.name}`}
              >
                {a.mime.startsWith('image/') && previewable(a.mime) ? (
                  <img src={fileUrl(a, true)} alt="" loading="lazy" />
                ) : (
                  <span aria-hidden="true">{iconOf(a)}</span>
                )}
              </button>
              <span className={styles.meta}>
                <button type="button" className={styles.name} onClick={() => open(a)} title={a.name}>
                  {a.name}
                </button>
                <span className={styles.sub}>
                  {fileSize(a.size)} · {a.byName} · {when(a.at)}
                </span>
              </span>
              <span className={styles.tools}>
                <a
                  href={fileUrl(a)}
                  download={a.name}
                  title="Télécharger"
                  aria-label={`Télécharger ${a.name}`}
                >
                  ⤓
                </a>
                {canEdit ? (
                  <button
                    type="button"
                    title="Supprimer"
                    aria-label={`Supprimer ${a.name}`}
                    onClick={() => remove(a)}
                  >
                    ✕
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {pending.length ? (
        <ul className={styles.pending}>
          {pending.map(p => (
            <li key={p.key} data-error={p.error ? true : undefined}>
              <span className={styles.pendingName}>{p.name}</span>
              {p.error ? (
                <>
                  <span>{p.error}</span>
                  <button type="button" onClick={() => setPending(l => l.filter(x => x.key !== p.key))}>
                    OK
                  </button>
                </>
              ) : (
                <span className={styles.bar} aria-label={`${Math.round(p.progress * 100)} %`}>
                  <span style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit ? (
        <p className={styles.drop}>
          <button type="button" onClick={() => input.current?.click()}>
            + Ajouter des fichiers
          </button>
          <span>
            ou glissez-les ici · cliquez dans la zone puis Ctrl+V pour coller une capture · {settings.maxMb}{' '}
            Mo au plus
          </span>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={accept}
            onChange={e => {
              add([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </p>
      ) : null}

      {viewing ? <Lightbox file={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function Lightbox({ file, onClose }: { file: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.lightbox} role="dialog" aria-label={file.name} onClick={onClose}>
      <img src={fileUrl(file, true)} alt={file.name} onClick={e => e.stopPropagation()} />
      <p>
        {file.name} ·{' '}
        <a href={fileUrl(file)} download={file.name} onClick={e => e.stopPropagation()}>
          Télécharger
        </a>{' '}
        · Échap pour fermer
      </p>
    </div>
  );
}

/** Pièces jointes repliées, pour les cartes (versions, références…) : « 📎 Pièces jointes (2) ». */
export function AttachmentsFold({ kind, id }: { kind: AttachableKind; id: string }) {
  const canEdit = useCanEdit();
  const count = useWorkspace(
    s => s.attachments.filter(a => a.owner.kind === kind && a.owner.id === id).length,
  );
  if (!canEdit && !count) return null;
  return (
    <details className={styles.fold}>
      <summary>📎 Pièces jointes{count ? ` (${count})` : ''}</summary>
      <Attachments kind={kind} id={id} />
    </details>
  );
}
