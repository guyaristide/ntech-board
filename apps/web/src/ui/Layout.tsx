import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageViewers, usePresenceBeacon } from './Presence';
import { QuickFind } from './QuickFind';
import { Sidebar } from './Sidebar';
import styles from './Layout.module.css';

/** Coquille de l'application : barre latérale, contenu, recherche rapide. */
export function Layout() {
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  usePresenceBeacon();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(s => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else document.getElementById('main')?.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return (
    <div className={styles.app} data-menu={menu || undefined}>
      <aside className={styles.aside}>
        <Sidebar onSearch={() => setSearch(true)} onNavigate={() => setMenu(false)} />
      </aside>
      <button
        type="button"
        className={styles.scrim}
        aria-label="Fermer le menu"
        onClick={() => setMenu(false)}
      />
      <main id="main" className={styles.main}>
        <button
          type="button"
          className={styles.burger}
          aria-label="Ouvrir le menu"
          onClick={() => setMenu(true)}
        >
          ☰
        </button>
        <PageViewers />
        <Outlet />
      </main>
      {search ? <QuickFind onClose={() => setSearch(false)} /> : null}
    </div>
  );
}
