import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ROLE_LABEL } from '@board/shared';
import { BRAND } from '../brand';
import { exportCsv, exportJson } from '../model/exporters';
import { useIsAdmin, useWorkspace, type SaveState } from '../model/store';
import { Avatar } from './Presence';
import styles from './Sidebar.module.css';

const SAVE_LABEL: Record<SaveState, string> = {
  saving: 'Enregistrement…',
  saved: 'Tout est enregistré',
  error: 'Échec de l’enregistrement, rechargez la page',
  offline: 'Hors connexion, reconnexion…',
};

const shortDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'à fixer';

/** Barre latérale : projet, navigation, épiques, ateliers, membres en ligne, compte. */
export function Sidebar({ onSearch, onNavigate }: { onSearch: () => void; onNavigate: () => void }) {
  const ws = useWorkspace();
  const admin = useIsAdmin();
  const [open, setOpen] = useState({ epics: true, workshops: true });
  const [editingName, setEditingName] = useState(false);
  const link = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.link} ${styles.active}` : styles.link;
  const count = (epic: string) => ws.stories.filter(s => s.epic === epic).length;
  const user = ws.session?.user;
  const online = [...new Map(ws.presence.map(p => [p.userId, p])).values()];

  return (
    <nav className={styles.sidebar} aria-label="Navigation">
      <a
        className={styles.brand}
        href={BRAND.site}
        target="_blank"
        rel="noreferrer"
        title={`${BRAND.publisher} · ${BRAND.company}`}
      >
        <img src={BRAND.logo} alt={BRAND.publisher} className={styles.logo} />
      </a>
      <div className={styles.workspace}>
        <div>
          <strong>{ws.session?.project.title}</strong>
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
        {ws.references.length ? (
          <NavLink to="/references" className={link}>
            <span className={styles.icon}>§</span> Références CdC{' '}
            <span className={styles.count}>{ws.references.length}</span>
          </NavLink>
        ) : null}
        {admin ? (
          <NavLink to="/admin" className={link}>
            <span className={styles.icon}>⚙</span> Administration
          </NavLink>
        ) : null}

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
        {online.length ? (
          <div className={styles.online} aria-label="Membres en ligne">
            <span className={styles.groupLabel}>En ligne</span>
            <span className={styles.avatars}>
              {online.map(p => (
                <Avatar key={p.userId} name={p.name || p.email} />
              ))}
            </span>
          </div>
        ) : null}
        <button type="button" className={styles.link} onClick={() => exportCsv(ws.stories)}>
          <span className={styles.icon}>↧</span> Exporter le backlog (CSV)
        </button>
        <button type="button" className={styles.link} onClick={() => exportJson(ws)}>
          <span className={styles.icon}>↧</span> Exporter le tableau (JSON)
        </button>
        {user ? (
          <div className={styles.account}>
            <Avatar name={user.name || user.email} />
            <div className={styles.accountText}>
              {editingName ? (
                <input
                  autoFocus
                  className={styles.nameInput}
                  defaultValue={user.name}
                  aria-label="Votre nom"
                  placeholder="Votre nom"
                  onBlur={e => {
                    setEditingName(false);
                    const name = e.target.value.trim();
                    if (name && name !== user.name) void ws.rename(name);
                  }}
                  onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                />
              ) : (
                <button
                  type="button"
                  className={styles.name}
                  title="Modifier votre nom"
                  onClick={() => setEditingName(true)}
                >
                  {user.name || 'Indiquer votre nom'}
                </button>
              )}
              <span className={styles.role}>
                {user.email} · {ws.session?.role ? ROLE_LABEL[ws.session.role] : ''}
              </span>
            </div>
            <button
              type="button"
              className={styles.logout}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              onClick={() => void ws.logout()}
            >
              ⏻
            </button>
          </div>
        ) : null}
        <p className={styles.publisher}>
          {BRAND.product} · un outil {BRAND.company}
        </p>
      </div>
    </nav>
  );
}
