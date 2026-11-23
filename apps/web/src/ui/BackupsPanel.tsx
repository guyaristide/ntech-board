import { useCallback, useEffect, useState } from 'react';
import {
  BACKUP_REASON_LABEL,
  fileSize,
  type BackupInfo,
  type BackupList,
  type BackupPolicy,
} from '@board/shared';
import { ApiError } from '../model/api';
import { backupsOf } from '../model/backups';
import page from '../pages/Page.module.css';
import table from '../pages/backlog/Backlog.module.css';
import styles from './BackupsPanel.module.css';
import { confirmDialog } from './Confirm';

const message = (e: unknown) => (e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.');

export const backupWhen = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Contenu d'une sauvegarde, en une ligne : « 418 US · 17 tickets · 38 risques ». */
export function backupContent(counts: Record<string, number>) {
  const parts: [string, string][] = [
    ['stories', 'US'],
    ['tickets', 'tickets'],
    ['risks', 'risques'],
    ['diligences', 'diligences'],
    ['comments', 'messages'],
    ['members', 'membres'],
  ];
  return (
    parts
      .filter(([k]) => counts[k])
      .map(([k, label]) => `${counts[k]} ${label}`)
      .join(' · ') || 'Projet vide'
  );
}

/** Règle de conservation, en clair. */
export const policyText = (p: BackupPolicy) =>
  `Une sauvegarde est prise chaque nuit vers ${p.hour} h, si le projet a changé. Toutes sont gardées ${p.daily} jours, puis une par semaine pendant ${p.weekly} semaines, puis une par mois pendant ${p.monthly} mois. Les sauvegardes manuelles se gardent jusqu’à leur suppression.`;

export function ReasonTag({ b }: { b: BackupInfo }) {
  return (
    <span className={styles.reason} data-reason={b.reason}>
      {BACKUP_REASON_LABEL[b.reason]}
    </span>
  );
}

/**
 * Sauvegardes d'un projet : liste, sauvegarde immédiate, téléchargement, retour à une sauvegarde.
 * Sert dans l'administration du projet et dans la console (`base` change, `slug` confirme).
 */
export function BackupsPanel({
  base,
  slug,
  title,
  onRestored,
}: {
  base?: string;
  slug: string;
  title: string;
  onRestored?: () => void;
}) {
  const [data, setData] = useState<BackupList | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const client = backupsOf(base);
  const load = useCallback(
    () =>
      backupsOf(base)
        .list()
        .then(setData, e => setError(message(e))),
    [base],
  );
  useEffect(() => void load(), [load]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      setDone(await action());
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const restore = async (b: BackupInfo) => {
    const ok = await confirmDialog({
      title: `Ramener ${title} à l’état du ${backupWhen(b.createdAt)} ?`,
      message:
        'Tout le contenu et les réglages du projet sont remplacés par ceux de cette sauvegarde : ce qui a été saisi depuis disparaît de l’écran. L’état actuel est d’abord sauvegardé, pour pouvoir revenir en arrière. Les membres et les fichiers joints ne changent pas.',
      confirmLabel: 'Restaurer',
      danger: true,
      typed: slug,
    });
    if (!ok) return;
    await run(async () => {
      const r = await client.restore(b.id, slug);
      onRestored?.();
      return `Projet ramené à l’état du ${backupWhen(b.createdAt)} : ${r.restored} éléments restaurés. L’état précédent est gardé dans la liste (« Avant une restauration »).`;
    });
  };
  const remove = async (b: BackupInfo) => {
    const ok = await confirmDialog({
      title: `Supprimer la sauvegarde du ${backupWhen(b.createdAt)} ?`,
      message: 'Le fichier est effacé du serveur : cet état du projet ne pourra plus être restauré.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok)
      await run(async () => {
        await client.remove(b.id);
        return 'Sauvegarde supprimée.';
      });
  };

  return (
    <section>
      <h2 className={page.h2}>Sauvegardes{data ? ` (${data.backups.length})` : ''}</h2>
      <p className={page.faint}>
        {data ? policyText(data.policy) : 'Chargement…'} Une sauvegarde contient les réglages, le cadrage, la
        réalisation, les discussions et la liste des membres ; pas les fichiers joints eux-mêmes ni
        l’historique des modifications.
      </p>
      <form
        className={styles.create}
        onSubmit={e => {
          e.preventDefault();
          void run(async () => {
            await client.create(note.trim());
            setNote('');
            return 'Sauvegarde prise.';
          });
        }}
      >
        <input
          value={note}
          maxLength={200}
          placeholder="Note, facultative (« avant l’import du planning »)"
          aria-label="Note de la sauvegarde"
          onChange={e => setNote(e.target.value)}
        />
        <button type="submit" className={page.primary} disabled={busy}>
          Sauvegarder maintenant
        </button>
      </form>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className={styles.done} role="status">
          {done}
        </p>
      ) : null}
      {data?.backups.length ? (
        <div className={table.tableWrap}>
          <table className={table.table} style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ width: 170 }}>Date</th>
                <th>Contenu</th>
                <th style={{ width: 70 }}>Taille</th>
                <th style={{ width: 228 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.backups.map(b => (
                <tr key={b.id}>
                  <td>
                    <strong className={styles.when}>{backupWhen(b.createdAt)}</strong>
                    <span className={styles.sub}>
                      <ReasonTag b={b} />
                      {b.by ? ` ${b.by}` : ''}
                    </span>
                  </td>
                  <td>
                    {backupContent(b.counts)}
                    <span className={styles.sub}>
                      {b.note ||
                        (b.verifiedAt.slice(0, 10) > b.createdAt.slice(0, 10)
                          ? `Projet inchangé jusqu’au ${backupWhen(b.verifiedAt)}`
                          : '')}
                    </span>
                  </td>
                  <td>{fileSize(b.size)}</td>
                  <td>
                    <span className={styles.actions}>
                      <a className={page.outline} href={client.downloadUrl(b.id)}>
                        Télécharger
                      </a>
                      <button
                        type="button"
                        className={page.outline}
                        disabled={busy}
                        onClick={() => restore(b)}
                      >
                        Restaurer
                      </button>
                      <button
                        type="button"
                        className={page.outline}
                        disabled={busy}
                        aria-label={`Supprimer la sauvegarde du ${backupWhen(b.createdAt)}`}
                        title="Supprimer"
                        onClick={() => remove(b)}
                      >
                        ✕
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <p className={page.faint}>Aucune sauvegarde pour l’instant : la première sera prise cette nuit.</p>
      ) : null}
    </section>
  );
}
