import { useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { exportCsv, exportJson } from '../model/exporters';
import { useWorkspace, type SaveState } from '../model/store';
import type { Workspace } from '../model/types';
import styles from './Sidebar.module.css';

const SAVE_LABEL: Record<SaveState, string> = {
  loading: 'Chargement…',
  saving: 'Enregistrement…',
  saved: 'Enregistré dans data/workspace.json',
  local: 'Enregistré dans ce navigateur',
  error: 'Échec de l’enregistrement',
};

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'janv. 2027';

/** Barre latérale : navigation, épiques, ateliers, import et export. */
export function Sidebar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate: () => void }) {
  const ws = useWorkspace();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState({ epics: true, workshops: true });
  const link = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;
  const count = (epic: string) => ws.stories.filter(s => s.epic === epic).length;

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as Workspace;
      if (!Array.isArray(data.stories) || !Array.isArray(data.workshops)) throw new Error();
      if (confirm('Remplacer l’espace de travail par le contenu de ce fichier ?')) ws.replace(data);
    } catch {
      alert('Ce fichier n’est pas un export de l’espace de cadrage.');
    }
  };

  return (
    <nav className={styles.sidebar} aria-label="Navigation">
      <div className={styles.workspace}>
        <span className={styles.logo} aria-hidden="true">
          eT
        </span>
        <div>
          <strong>Cadrage eTourisme</strong>
          <span className={styles.save} data-state={ws.save} title={SAVE_LABEL[ws.save]}>
            {SAVE_LABEL[ws.save]}
          </span>
        </div>
      </div>
      <button type="button" className={styles.link} onClick={onSearch}>
        <span className={styles.icon}>⌕</span> Rechercher <kbd>⌘K</kbd>
      </button>
      <div onClick={onNavigate}>
        <NavLink to="/" end className={link}>
          <span className={styles.icon}>⌂</span> Accueil
        </NavLink>
        <NavLink to="/backlog" className={link}>
          <span className={styles.icon}>☰</span> Backlog des US{' '}
          <span className={styles.count}>{ws.stories.length}</span>
        </NavLink>
        <NavLink to="/programme" className={link}>
          <span className={styles.icon}>▦</span> Programme des ateliers
        </NavLink>
        <NavLink to="/references" className={link}>
          <span className={styles.icon}>§</span> Références CdC{' '}
          <span className={styles.count}>{ws.references.length}</span>
        </NavLink>

        <button
          type="button"
          className={styles.group}
          aria-expanded={open.epics}
          onClick={() => setOpen(o => ({ ...o, epics: !o.epics }))}
        >
          {open.epics ? '▾' : '▸'} Épiques
        </button>
        {open.epics
          ? ws.epics.map(e => (
              <NavLink key={e.id} to={`/epic/${e.id}`} className={link} title={e.title}>
                <span className={styles.code}>{e.id}</span>
                <span className={styles.label}>{e.title}</span>
                <span className={styles.count}>{count(e.id)}</span>
              </NavLink>
            ))
          : null}

        <button
          type="button"
          className={styles.group}
          aria-expanded={open.workshops}
          onClick={() => setOpen(o => ({ ...o, workshops: !o.workshops }))}
        >
          {open.workshops ? '▾' : '▸'} Ateliers
        </button>
        {open.workshops
          ? ws.workshops.map(w => (
              <NavLink key={w.id} to={`/atelier/${w.id}`} className={link} title={w.title}>
                <span className={styles.code}>{w.id}</span>
                <span className={styles.label}>{w.title}</span>
                <span className={styles.count}>{shortDate(w.date)}</span>
              </NavLink>
            ))
          : null}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.link} onClick={() => exportCsv(ws.stories)}>
          <span className={styles.icon}>↧</span> Exporter le backlog (CSV)
        </button>
        <button type="button" className={styles.link} onClick={() => exportJson(ws)}>
          <span className={styles.icon}>↧</span> Exporter l’espace (JSON)
        </button>
        <button type="button" className={styles.link} onClick={() => file.current?.click()}>
          <span className={styles.icon}>↥</span> Importer un export JSON
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={e => onImport(e.target.files?.[0])}
        />
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            if (
              confirm(
                'Repartir du contenu d’origine ? Les enrichissements seront perdus (pensez à exporter avant).',
              )
            ) {
              ws.reset();
              navigate('/');
            }
          }}
        >
          <span className={styles.icon}>↺</span> Réinitialiser
        </button>
      </div>
    </nav>
  );
}
