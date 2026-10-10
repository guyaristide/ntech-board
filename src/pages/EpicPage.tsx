import { Link, useNavigate, useParams } from 'react-router-dom';
import { STATUSES } from '../model/options';
import { useWorkspace } from '../model/store';
import { BlockEditor } from '../ui/BlockEditor';
import { Tag } from '../ui/Tag';
import { StoryList } from './backlog/Backlog';
import page from './Page.module.css';
import styles from './Overview.module.css';

/** Page d'une épique (cas d'usage du CDC) : résumé, points à cadrer, US rattachées, notes. */
export function EpicPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const epic = ws.epics.find(e => e.id === id);
  if (!epic) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Épique introuvable</h1>
        <Link to="/backlog">Retour au backlog</Link>
      </div>
    );
  }
  const stories = ws.stories.filter(s => s.epic === epic.id);
  const validated = stories.filter(s => s.status === 'Validée').length;
  return (
    <div className={`${page.page} ${page.wide}`}>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/backlog">Backlog</Link> / <span>{epic.id}</span>
      </nav>
      <p className={page.kicker}>{epic.id}</p>
      <h1 className={page.h1}>{epic.title}</h1>
      <p className={page.lead}>{epic.summary}</p>
      <div className={page.props}>
        <span className={page.propLabel}>⬢ Version</span>
        <div className={page.propText}>
          <Tag value={epic.version} />
        </div>
        <span className={page.propLabel}>▦ Ateliers</span>
        <div className={`${page.propText} ${styles.inline}`}>
          {epic.workshops.length
            ? epic.workshops.map(w => (
                <Link key={w} to={`/atelier/${w}`} className={styles.chip}>
                  {w} · {ws.workshops.find(x => x.id === w)?.title ?? 'séquence ajoutée'}
                </Link>
              ))
            : 'À définir'}
        </div>
        <span className={page.propLabel}>§ Source</span>
        <div className={page.propText}>{epic.source}</div>
        <span className={page.propLabel}>◉ Avancement</span>
        <div className={`${page.propText} ${styles.inline}`}>
          {STATUSES.map(st => {
            const n = stories.filter(s => s.status === st).length;
            return n ? <Tag key={st} value={st}>{`${st} · ${n}`}</Tag> : null;
          })}
          <span className={page.faint}>
            {validated}/{stories.length} validées
          </span>
        </div>
      </div>

      {epic.toFrame.length ? (
        <>
          <h2 className={page.h2}>Points à cadrer en atelier</h2>
          <ul className={page.list}>
            {epic.toFrame.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className={styles.sectionHead}>
        <h2 className={page.h2}>User stories ({stories.length})</h2>
        <button
          type="button"
          className={page.primary}
          onClick={() => navigate(`/us/${ws.createStory(epic.id)}?nouvelle=1`)}
        >
          Nouvelle US
        </button>
      </div>
      <StoryList stories={stories} />

      <h2 className={page.h2}>Notes de l’épique</h2>
      <BlockEditor blocks={epic.body} onChange={body => ws.updateEpic(epic.id, { body })} />
    </div>
  );
}
