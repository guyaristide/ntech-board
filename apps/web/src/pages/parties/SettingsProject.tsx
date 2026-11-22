import { useState } from 'react';
import { api, ApiError } from '../../model/api';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import styles from './Parties.module.css';

/**
 * Identité du tableau : son nom et son sous-titre (menu, page d'accueil, page de connexion).
 * Enregistrés à part des autres réglages, par leur propre bouton.
 */
export function SettingsProject() {
  const current = useWorkspace(s => s.session?.project);
  const [title, setTitle] = useState(current?.title ?? '');
  const [subtitle, setSubtitle] = useState(current?.subtitle ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const dirty = title.trim() !== (current?.title ?? '') || subtitle.trim() !== (current?.subtitle ?? '');
  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      await api.patch('/admin/project', { title: title.trim(), subtitle: subtitle.trim() });
      await useWorkspace.getState().init();
      setStatus('Nom du tableau enregistré.');
    } catch (e) {
      setStatus(e instanceof ApiError ? (e.message ?? 'Saisie refusée.') : 'Erreur réseau, réessayez.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.section}>
      <h2 className={page.h2}>Tableau</h2>
      <form
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <div className={styles.fields}>
          <label htmlFor="project-title">Nom du tableau</label>
          <input id="project-title" value={title} required onChange={e => setTitle(e.target.value)} />
          <label htmlFor="project-subtitle">Sous-titre</label>
          <span>
            <input
              id="project-subtitle"
              value={subtitle}
              style={{ width: '100%' }}
              onChange={e => setSubtitle(e.target.value)}
            />
            <p className={styles.hint}>Affiché sous le nom, sur l’accueil et la page de connexion.</p>
          </span>
          <span>Adresse</span>
          <span>
            <code>{current?.slug}</code>
            <p className={styles.hint}>
              Identifiant du projet dans l’adresse du tableau ; il ne se modifie pas ici.
            </p>
          </span>
        </div>
        <p className={page.actions} style={{ marginLeft: 0, marginTop: 12 }}>
          <button type="submit" className={page.primary} disabled={busy || !dirty || !title.trim()}>
            {busy ? 'Enregistrement…' : 'Enregistrer le nom'}
          </button>
          {status ? (
            <span className={page.faint} role="status">
              {status}
            </span>
          ) : null}
        </p>
      </form>
    </section>
  );
}
