import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fileSize, type PlatformProject, type PlatformProjectDetail } from '@board/shared';
import { platform } from '../../model/platform';
import { noticeDialog } from '../../ui/Confirm';
import { SideTabs, useSideTab, type SideTab } from '../../ui/SideTabs';
import page from '../Page.module.css';
import { day, message } from './format';
import { dateTime, Facts, Stat } from './parts';
import { ProjectAccess, ProjectJournal, ProjectMembers } from './ProjectPeople';
import { ProjectAdvanced, ProjectData, ProjectSettingsView } from './ProjectData';
import styles from './Platform.module.css';

const TABS = [
  { id: 'overview', label: 'Vue d’ensemble', hint: 'Contenu et activité', icon: 'gauge' },
  { id: 'members', label: 'Membres', hint: 'Rôles et invitations', icon: 'users' },
  { id: 'access', label: 'Accès', hint: 'Sessions et jetons MCP', icon: 'shield' },
  { id: 'settings', label: 'Réglages', hint: 'Configuration du projet', icon: 'sliders' },
  { id: 'data', label: 'Données', hint: 'Export, imports, copie', icon: 'download' },
  { id: 'journal', label: 'Journal', hint: 'Dernières modifications', icon: 'list' },
  { id: 'advanced', label: 'Avancé', hint: 'Adresse, suppression', icon: 'alert' },
] as const satisfies readonly SideTab[];
type TabId = (typeof TABS)[number]['id'];

/** Libellés des types d'éléments, dans l'ordre où on les lit. */
const KINDS: [string, string][] = [
  ['story', 'User stories'],
  ['epic', 'Épiques'],
  ['workshop', 'Ateliers'],
  ['reference', 'Références'],
  ['phase', 'Phases RACI'],
  ['risk', 'Risques'],
  ['diligence', 'Diligences'],
  ['party', 'Parties prenantes'],
  ['release', 'Versions'],
  ['sprint', 'Sprints'],
  ['ticket', 'Tickets'],
  ['campaign', 'Campagnes de recette'],
  ['comment', 'Messages'],
  ['attachment', 'Fichiers'],
  ['source', 'Échanges déposés'],
  ['proposal', 'Propositions'],
];

/** Activité des 30 derniers jours : une barre par jour, la hauteur selon le nombre de modifications. */
function Activity({ days }: { days: { day: string; n: number }[] }) {
  const byDay = new Map(days.map(d => [d.day, d.n]));
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const key = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { key, n: byDay.get(key) ?? 0 };
  });
  const max = Math.max(1, ...last30.map(d => d.n));
  const total = last30.reduce((n, d) => n + d.n, 0);
  return (
    <figure className={styles.activity}>
      <div className={styles.bars} role="img" aria-label={`${total} modifications sur 30 jours`}>
        {last30.map(d => (
          <span
            key={d.key}
            data-empty={!d.n || undefined}
            style={{ height: `${d.n ? Math.max(8, (d.n / max) * 100) : 4}%` }}
            title={`${new Date(`${d.key}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${d.n} modification(s)`}
          />
        ))}
      </div>
      <figcaption>
        {total} modification(s) sur 30 jours · {last30.filter(d => d.n).length} jour(s) actif(s)
      </figcaption>
    </figure>
  );
}

function Overview({ d }: { d: PlatformProjectDetail }) {
  const p = d.project;
  const [title, setTitle] = useState(p.title);
  const [subtitle, setSubtitle] = useState(p.subtitle);
  return (
    <>
      <section>
        <div className={styles.kpis}>
          <Stat label="Membres" value={p.members} hint={`${p.admins.length} administrateur(s)`} />
          <Stat label="En ligne" value={d.online.users.length} hint={`${d.online.tabs} onglet(s)`} />
          <Stat label="User stories" value={p.stories} />
          <Stat
            label="Tickets"
            value={p.tickets}
            hint={p.delivery ? 'Réalisation active' : 'Réalisation inactive'}
          />
          <Stat label="Fichiers" value={p.files} hint={fileSize(p.bytes)} />
        </div>
        <h2 className={page.h2}>Activité</h2>
        <Activity days={d.activity} />
        <Facts
          rows={[
            ['Dernière modification', dateTime(p.lastActivity)],
            ['Créé le', day(p.createdAt)],
            [
              'En ligne en ce moment',
              d.online.users.length ? d.online.users.map(u => u.name || u.email).join(', ') : 'Personne',
            ],
          ]}
        />
      </section>
      <section>
        <h2 className={page.h2}>Contenu</h2>
        <div className={styles.counts}>
          {KINDS.filter(([k]) => d.counts[k]).map(([k, label]) => (
            <span key={k}>
              <strong>{d.counts[k]}</strong> {label}
            </span>
          ))}
          {!Object.keys(d.counts).length ? <span>Projet vide.</span> : null}
        </div>
      </section>
      <section>
        <h2 className={page.h2}>Qui y travaille (30 jours)</h2>
        {d.contributors.length ? (
          <ul className={styles.rank}>
            {d.contributors.map(c => (
              <li key={c.email}>
                <span>{c.name || c.email}</span>
                <span className={styles.rankBar}>
                  <span style={{ width: `${(c.n / d.contributors[0].n) * 100}%` }} />
                </span>
                <small>{c.n}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className={page.faint}>Aucune modification sur 30 jours.</p>
        )}
      </section>
      <section>
        <h2 className={page.h2}>Identité</h2>
        <form
          className={styles.form}
          onSubmit={async e => {
            e.preventDefault();
            try {
              await platform.updateProject(p.slug, { title: title.trim(), subtitle: subtitle.trim() });
              window.dispatchEvent(new Event('platform:changed'));
            } catch (err) {
              void noticeDialog('Enregistrement impossible.', message(err));
            }
          }}
        >
          <label className={styles.field}>
            Nom du tableau
            <input value={title} required maxLength={120} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className={styles.field}>
            Sous-titre
            <input value={subtitle} maxLength={300} onChange={e => setSubtitle(e.target.value)} />
          </label>
          <p>
            <button
              type="submit"
              className={page.primary}
              disabled={!title.trim() || (title.trim() === p.title && subtitle.trim() === p.subtitle)}
            >
              Enregistrer
            </button>
          </p>
        </form>
      </section>
    </>
  );
}

/** Page d'un projet dans la console : tout ce qu'un super-administrateur peut y voir et y faire. */
export function ProjectPage({ projects }: { projects: PlatformProject[] }) {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [tab, selectTab] = useSideTab<TabId>(TABS);
  const [d, setD] = useState<PlatformProjectDetail | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(
    () =>
      platform.detail(slug).then(
        x => {
          setD(x);
          setError('');
        },
        e => setError(message(e)),
      ),
    [slug],
  );
  useEffect(() => {
    setD(null);
    void reload();
    const onChange = () => void reload();
    window.addEventListener('platform:changed', onChange);
    return () => window.removeEventListener('platform:changed', onChange);
  }, [reload]);
  const open = async () => {
    const tabWindow = window.open('about:blank', '_blank');
    try {
      const { url } = await platform.open(slug);
      if (tabWindow) tabWindow.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tabWindow?.close();
      void noticeDialog('Ouverture impossible.', message(e));
    }
  };
  if (error && !d)
    return (
      <>
        <p className={page.crumbs}>
          <Link to="/">Projets</Link> / <span>{slug}</span>
        </p>
        <p className={styles.error} role="alert">
          {error === 'not_found' ? 'Ce projet n’existe pas ou a été supprimé.' : error}
        </p>
      </>
    );
  if (!d) return <p className={page.faint}>Chargement…</p>;
  const p = d.project;
  return (
    <>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/">Projets</Link> / <span>{p.title}</span>
        <span className={page.actions}>
          <button type="button" className={page.primary} onClick={() => void open()}>
            Ouvrir le tableau ↗
          </button>
        </span>
      </nav>
      <p className={page.kicker}>{p.slug}</p>
      <h1 className={page.h1}>{p.title}</h1>
      <p className={page.lead}>
        {p.subtitle ? `${p.subtitle} · ` : ''}
        <a href={p.url} target="_blank" rel="noreferrer">
          {p.url.replace(/^https?:\/\//, '')}
        </a>
      </p>
      <SideTabs tabs={TABS} current={tab} onSelect={selectTab} label="Rubriques du projet">
        {tab === 'overview' ? <Overview key={p.slug + p.title + p.subtitle} d={d} /> : null}
        {tab === 'members' ? <ProjectMembers project={p} onChanged={reload} /> : null}
        {tab === 'access' ? <ProjectAccess d={d} onChanged={reload} /> : null}
        {tab === 'settings' ? <ProjectSettingsView d={d} projects={projects} onChanged={reload} /> : null}
        {tab === 'data' ? <ProjectData project={p} onChanged={reload} /> : null}
        {tab === 'journal' ? <ProjectJournal slug={p.slug} /> : null}
        {tab === 'advanced' ? (
          <ProjectAdvanced
            project={p}
            onRenamed={next => navigate(`/projet/${next}?tab=advanced`, { replace: true })}
            onDeleted={() => navigate('/', { replace: true })}
          />
        ) : null}
      </SideTabs>
    </>
  );
}
