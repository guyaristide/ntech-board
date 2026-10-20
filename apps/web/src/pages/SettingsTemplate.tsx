import { useEffect, useState } from 'react';
import { api, ApiError } from '../model/api';
import { useWorkspace } from '../model/store';
import page from './Page.module.css';
import styles from './Admin.module.css';

/**
 * Reprendre les réglages d'un autre projet : versions, acteurs, document de référence, périmètres
 * de risque, types d'organisations, workflow et types de tickets. Le contenu n'est pas copié.
 */
export function SettingsTemplate() {
  const [projects, setProjects] = useState<{ slug: string; title: string }[]>([]);
  const [from, setFrom] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    api.get<{ slug: string; title: string }[]>('/admin/templates').then(setProjects, () => setProjects([]));
  }, []);
  if (!projects.length) return null;
  const copy = async () => {
    const source = projects.find(p => p.slug === from);
    if (!source || !confirm(`Remplacer les réglages de ce tableau par ceux de « ${source.title} » ?`)) return;
    try {
      await api.post('/admin/settings/copy', { from });
      await useWorkspace.getState().init();
      setStatus(`Réglages repris de « ${source.title} ».`);
    } catch (e) {
      setStatus(e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.');
    }
  };
  return (
    <>
      <h2 className={page.h2}>Réglages d’un autre projet</h2>
      <p className={page.faint}>
        Pour démarrer un tableau sur le modèle d’un autre : versions, acteurs, document de référence,
        périmètres de risque, types d’organisations, étapes et types de tickets. Le contenu (US, ateliers,
        risques…) n’est pas copié, ni la clé des tickets et les accès nominatifs à la Réalisation.
      </p>
      <div className={styles.invite}>
        <select value={from} aria-label="Projet modèle" onChange={e => setFrom(e.target.value)}>
          <option value="">Choisir un projet…</option>
          {projects.map(p => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
        <button type="button" className={page.primary} disabled={!from} onClick={() => void copy()}>
          Reprendre ses réglages
        </button>
        {status ? <span className={page.faint}>{status}</span> : null}
      </div>
    </>
  );
}
