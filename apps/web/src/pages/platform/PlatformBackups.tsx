import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { fileSize, SLUG_PATTERN, type BackupInfo, type BackupList } from '@board/shared';
import { platformBackups } from '../../model/backups';
import { backupContent, backupWhen, policyText, ReasonTag } from '../../ui/BackupsPanel';
import { confirmDialog } from '../../ui/Confirm';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { message } from './format';
import styles from './Platform.module.css';

/** Recrée un projet à partir d'une sauvegarde, à une nouvelle adresse. */
function RestoreAs({
  backup,
  me,
  onClose,
}: {
  backup: BackupInfo;
  me: string;
  onClose: (done: boolean) => void;
}) {
  const [title, setTitle] = useState(backup.projectTitle);
  const [slug, setSlug] = useState(backup.orphan ? backup.projectSlug : `${backup.projectSlug}-copie`);
  const [admin, setAdmin] = useState(me);
  const [members, setMembers] = useState(backup.orphan);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await platformBackups.restoreAs(backup.id, { slug, title: title.trim(), admin: admin.trim(), members });
      window.dispatchEvent(new Event('platform:projects'));
      onClose(true);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  return (
    <div className={styles.backdrop} onMouseDown={e => e.target === e.currentTarget && onClose(false)}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Recréer un projet"
        onSubmit={submit}
      >
        <h2 className={styles.dialogTitle}>Recréer un projet depuis cette sauvegarde</h2>
        <p className={page.faint}>
          {backup.projectTitle}, état du {backupWhen(backup.createdAt)} : {backupContent(backup.counts)}. Les
          fichiers joints ne sont pas repris.
        </p>
        <label className={styles.field}>
          Nom du tableau
          <input value={title} required autoFocus maxLength={120} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className={styles.field}>
          Adresse
          <input
            value={slug}
            required
            className={styles.mono}
            onChange={e => setSlug(e.target.value.toLowerCase())}
          />
          <small>Minuscules, chiffres et tirets, 3 à 40 caractères ; elle ne doit pas être déjà prise.</small>
        </label>
        <label className={styles.field}>
          Administrateur
          <input type="email" value={admin} required onChange={e => setAdmin(e.target.value)} />
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={members} onChange={e => setMembers(e.target.checked)} />
          Remettre aussi les {backup.counts.members ?? 0} membres de la sauvegarde, avec leur rôle
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.dialogActions}>
          <button type="button" className={page.outline} onClick={() => onClose(false)}>
            Annuler
          </button>
          <button type="submit" className={page.primary} disabled={busy || !SLUG_PATTERN.test(slug)}>
            {busy ? 'Restauration…' : 'Recréer le projet'}
          </button>
        </p>
      </form>
    </div>
  );
}

/** Sauvegardes de toute la plateforme : état par projet, et projets supprimés encore restaurables. */
export function PlatformBackups({ me }: { me: string }) {
  const [data, setData] = useState<BackupList | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<BackupInfo | null>(null);
  const load = useCallback(() => platformBackups.list().then(setData, e => setError(message(e))), []);
  useEffect(() => void load(), [load]);

  const live = (data?.backups ?? []).filter(b => !b.orphan);
  const lost = (data?.backups ?? []).filter(b => b.orphan);
  const slugs = [...new Set(live.map(b => b.projectSlug))];
  const total = (data?.backups ?? []).reduce((n, b) => n + b.size, 0);
  const runAll = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await platformBackups.run();
      setDone(
        `${r.created} projet${r.created > 1 ? 's' : ''} sauvegardé${r.created > 1 ? 's' : ''} sur ${r.projects}${r.failed.length ? ` · échec : ${r.failed.join(', ')}` : ''}.`,
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (b: BackupInfo) => {
    const ok = await confirmDialog({
      title: `Supprimer la sauvegarde de ${b.projectTitle} du ${backupWhen(b.createdAt)} ?`,
      message: 'Le fichier est effacé du serveur : cet état du projet ne pourra plus être restauré.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    await platformBackups.remove(b.id).then(load, e => setError(message(e)));
  };

  return (
    <>
      <section>
        <div className={styles.sectionHead}>
          <h2 className={page.h2}>Sauvegardes</h2>
          <button type="button" className={page.primary} disabled={busy} onClick={runAll}>
            {busy ? 'Sauvegarde…' : 'Sauvegarder tous les projets'}
          </button>
        </div>
        <p className={page.faint}>
          {data ? policyText(data.policy) : 'Chargement…'} Les fichiers sont dans le stockage du serveur
          (dossier <code>backups/projects</code>) : copiez ce volume hors du serveur pour être protégé contre
          sa perte.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {done ? <p className={styles.note}>{done}</p> : null}
        {data ? (
          <div className={styles.kpis}>
            <div className={styles.kpi}>
              <span>Sauvegardes gardées</span>
              <strong>{data.backups.length}</strong>
            </div>
            <div className={styles.kpi}>
              <span>Projets couverts</span>
              <strong>{slugs.length}</strong>
            </div>
            <div className={styles.kpi}>
              <span>Espace occupé</span>
              <strong>{fileSize(total)}</strong>
            </div>
            <div className={styles.kpi}>
              <span>Projets supprimés restaurables</span>
              <strong>{new Set(lost.map(b => b.projectSlug)).size}</strong>
            </div>
          </div>
        ) : null}
        <div className={backlog.tableWrap}>
          <table className={backlog.table} style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Projet</th>
                <th style={{ width: 210 }}>Dernière sauvegarde</th>
                <th>Contenu</th>
                <th style={{ width: 110 }}>Gardées</th>
                <th style={{ width: 200 }} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {slugs.map(slug => {
                const own = live.filter(b => b.projectSlug === slug);
                const last = own[0];
                return (
                  <tr key={slug}>
                    <td>
                      <strong className={styles.name}>{last.projectTitle}</strong>
                      <span className={styles.sub}>{slug}</span>
                    </td>
                    <td>
                      {backupWhen(last.createdAt)}
                      <span className={styles.sub}>
                        <ReasonTag b={last} />
                      </span>
                    </td>
                    <td>{backupContent(last.counts)}</td>
                    <td>
                      {own.length} · {fileSize(own.reduce((n, b) => n + b.size, 0))}
                    </td>
                    <td>
                      <span className={styles.rowActions}>
                        <Link className={page.outline} to={`/projet/${slug}?tab=backups`}>
                          Voir et restaurer
                        </Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data && !slugs.length ? <p className={page.faint}>Aucune sauvegarde pour l’instant.</p> : null}
      </section>

      <section>
        <h2 className={page.h2}>Projets supprimés</h2>
        <p className={page.faint}>
          Un projet est sauvegardé juste avant sa suppression ; ses sauvegardes restent ici{' '}
          {data?.policy.safetyDays ?? 90} jours et permettent de le recréer.
        </p>
        {lost.length ? (
          <div className={backlog.tableWrap}>
            <table className={backlog.table} style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Projet supprimé</th>
                  <th style={{ width: 210 }}>Sauvegarde</th>
                  <th>Contenu</th>
                  <th style={{ width: 80 }}>Taille</th>
                  <th style={{ width: 300 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {lost.map(b => (
                  <tr key={b.id}>
                    <td>
                      <strong className={styles.name}>{b.projectTitle}</strong>
                      <span className={styles.sub}>{b.projectSlug}</span>
                    </td>
                    <td>
                      {backupWhen(b.createdAt)}
                      <span className={styles.sub}>
                        <ReasonTag b={b} />
                      </span>
                    </td>
                    <td>{backupContent(b.counts)}</td>
                    <td>{fileSize(b.size)}</td>
                    <td>
                      <span className={styles.rowActions}>
                        <button type="button" className={page.outline} onClick={() => setTarget(b)}>
                          Recréer le projet
                        </button>
                        <a className={page.outline} href={platformBackups.downloadUrl(b.id)}>
                          Télécharger
                        </a>
                        <button
                          type="button"
                          className={page.outline}
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
        ) : (
          <p className={page.faint}>Aucun projet supprimé à restaurer.</p>
        )}
      </section>
      {target ? (
        <RestoreAs
          backup={target}
          me={me}
          onClose={ok => {
            setTarget(null);
            if (ok) {
              setDone('Projet recréé : il est dans la rubrique Projets.');
              void load();
            }
          }}
        />
      ) : null}
    </>
  );
}
