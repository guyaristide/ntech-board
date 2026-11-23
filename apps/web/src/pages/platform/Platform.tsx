import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { fileSize, type PlatformOverview, type PlatformProject } from '@board/shared';
import { BRAND } from '../../brand';
import { platform } from '../../model/platform';
import { useWorkspace } from '../../model/store';
import { noticeDialog } from '../../ui/Confirm';
import { Icon } from '../../ui/Icon';
import { sideTabsPage, useSideTab, type SideTab } from '../../ui/SideTabs';
import page from '../Page.module.css';
import backlog from '../backlog/Backlog.module.css';
import { day, message } from './format';
import { NewProject } from './NewProject';
import { PlatformAdmins, PlatformUsers } from './PlatformPeople';
import { PlatformJournal, PlatformStatusView } from './PlatformStatusView';
import { ProjectPage } from './ProjectPage';
import styles from './Platform.module.css';

const TABS = [
  { id: 'projects', label: 'Projets', hint: 'Tous les tableaux', icon: 'layers' },
  { id: 'users', label: 'Comptes', hint: 'Utilisateurs et rôles', icon: 'users' },
  { id: 'admins', label: 'Super-administrateurs', hint: 'Accès à cette console', icon: 'shield' },
  { id: 'health', label: 'État', hint: 'Services, base, activité', icon: 'gauge' },
  { id: 'journal', label: 'Journal', hint: 'Actions de la console', icon: 'list' },
] as const satisfies readonly SideTab[];
type TabId = (typeof TABS)[number]['id'];

/** « aujourd'hui », « il y a 3 j », puis la date : pour repérer d'un coup d'œil un projet endormi. */
const since = (iso: string | null) => {
  if (!iso) return 'Jamais';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? 'Aujourd’hui' : days < 30 ? `Il y a ${days} j` : day(iso);
};

/**
 * Console de la plateforme, au-dessus de tous les projets : réservée aux super-administrateurs,
 * servie sur son propre hôte. Vue d'ensemble, création et administration des projets, comptes,
 * super-administrateurs, état des services.
 */
export function Platform() {
  const user = useWorkspace(s => s.session?.user);
  const logout = useWorkspace(s => s.logout);
  const [tab] = useSideTab<TabId>(TABS);
  const location = useLocation();
  // Dans la page d'un projet, c'est la rubrique Projets qui est active.
  const section: TabId = location.pathname.startsWith('/projet/') ? 'projects' : tab;
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const reload = useCallback(
    () =>
      platform.overview().then(
        d => {
          setData(d);
          setError('');
        },
        e => setError(message(e)),
      ),
    [],
  );
  useEffect(() => {
    void reload();
    // Un projet créé, dupliqué ou modifié ailleurs dans la console : la liste est relue.
    const onChange = () => void reload();
    window.addEventListener('platform:projects', onChange);
    window.addEventListener('platform:changed', onChange);
    return () => {
      window.removeEventListener('platform:projects', onChange);
      window.removeEventListener('platform:changed', onChange);
    };
  }, [reload]);
  useEffect(() => {
    document.title = `Console · ${BRAND.product}`;
  }, []);

  const open = async (p: PlatformProject) => {
    // L'onglet est ouvert tout de suite (geste de l'utilisateur), puis dirigé vers le lien d'entrée.
    const tabWindow = window.open('about:blank', '_blank');
    try {
      const { url } = await platform.open(p.slug);
      if (tabWindow) tabWindow.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tabWindow?.close();
      void noticeDialog('Ouverture impossible.', message(e));
    }
  };
  const projects = (data?.projects ?? []).filter(p =>
    `${p.title} ${p.slug} ${p.admins.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const total = (pick: (p: PlatformProject) => number) =>
    (data?.projects ?? []).reduce((n, p) => n + pick(p), 0);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        <img src={BRAND.logo} alt={BRAND.publisher} className={styles.logo} />
        <span className={styles.badge}>Console</span>
        {/* Rubriques de la console : toujours à portée, y compris depuis la page d'un projet. */}
        <nav className={styles.topNav} aria-label="Rubriques de la console">
          {TABS.map(t => (
            <Link
              key={t.id}
              to={t.id === 'projects' ? '/' : `/?tab=${t.id}`}
              aria-current={section === t.id ? 'page' : undefined}
              title={t.hint}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </Link>
          ))}
        </nav>
        <span className={styles.who}>
          {user?.name || user?.email}
          <button type="button" className={page.ghost} onClick={() => void logout()}>
            <Icon name="logout" size={14} /> Se déconnecter
          </button>
        </span>
      </header>
      <main className={`${page.page} ${sideTabsPage} ${styles.main}`}>
        <Routes>
          <Route path="projet/:slug" element={<ProjectPage projects={data?.projects ?? []} />} />
          <Route
            path="*"
            element={
              <>
                <h1 className={page.h1}>Console de la plateforme</h1>
                <p className={page.lead}>
                  Tous les projets de {BRAND.product}, leurs membres et leurs données. Réservée aux
                  super-administrateurs.
                </p>
                {error ? (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                ) : null}
                <div className={styles.home}>
                  {tab === 'projects' ? (
                    <section>
                      <div className={styles.kpis}>
                        {(
                          [
                            ['Projets', data?.projects.length],
                            ['Comptes', data?.users],
                            ['User stories', total(p => p.stories)],
                            ['Tickets', total(p => p.tickets)],
                            ['Fichiers', data ? fileSize(total(p => p.bytes)) : undefined],
                          ] as const
                        ).map(([label, value]) => (
                          <div key={label} className={styles.kpi}>
                            <span>{label}</span>
                            <strong>{value ?? '…'}</strong>
                          </div>
                        ))}
                      </div>
                      <div className={styles.toolbar}>
                        <input
                          type="search"
                          value={q}
                          placeholder="Rechercher un projet, une adresse, un administrateur"
                          aria-label="Rechercher un projet"
                          onChange={e => setQ(e.target.value)}
                        />
                        <button type="button" className={page.primary} onClick={() => setCreating(true)}>
                          + Nouveau projet
                        </button>
                      </div>
                      <div className={backlog.tableWrap}>
                        <table className={backlog.table} style={{ minWidth: 860 }}>
                          <thead>
                            <tr>
                              <th>Projet</th>
                              <th style={{ width: 84 }}>Membres</th>
                              <th style={{ width: 64 }}>US</th>
                              <th style={{ width: 72 }}>Tickets</th>
                              <th style={{ width: 96 }}>Fichiers</th>
                              <th style={{ width: 116 }}>Activité</th>
                              <th style={{ width: 168 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {projects.map(p => (
                              <tr key={p.slug}>
                                <td>
                                  <Link to={`/projet/${p.slug}`} className={styles.name}>
                                    {p.title}
                                  </Link>
                                  <span className={styles.sub}>
                                    <a href={p.url} target="_blank" rel="noreferrer">
                                      {p.url.replace(/^https?:\/\//, '')}
                                    </a>
                                    {p.delivery ? <span className={styles.flag}>Réalisation</span> : null}
                                    {p.aiKey ? <span className={styles.flag}>Claude</span> : null}
                                  </span>
                                </td>
                                <td>{p.members}</td>
                                <td>{p.stories}</td>
                                <td>{p.tickets}</td>
                                <td>{p.files ? fileSize(p.bytes) : '—'}</td>
                                <td
                                  title={
                                    p.lastActivity
                                      ? new Date(p.lastActivity).toLocaleString('fr-FR')
                                      : undefined
                                  }
                                >
                                  {since(p.lastActivity)}
                                </td>
                                <td className={styles.rowActions}>
                                  <button type="button" className={page.outline} onClick={() => void open(p)}>
                                    Ouvrir ↗
                                  </button>
                                  <button
                                    type="button"
                                    className={page.ghost}
                                    onClick={() => navigate(`/projet/${p.slug}`)}
                                  >
                                    Gérer
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {data && !projects.length ? (
                              <tr>
                                <td colSpan={7} className={backlog.empty}>
                                  {q ? 'Aucun projet ne correspond.' : 'Aucun projet : créez le premier.'}
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}
                  {tab === 'users' ? <PlatformUsers /> : null}
                  {tab === 'admins' ? <PlatformAdmins me={user?.email ?? ''} /> : null}
                  {tab === 'health' ? <PlatformStatusView /> : null}
                  {tab === 'journal' ? <PlatformJournal /> : null}
                </div>
              </>
            }
          />
        </Routes>
      </main>
      {creating ? (
        <NewProject
          projects={data?.projects ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}
