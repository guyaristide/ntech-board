import { Link } from 'react-router-dom';
import { STATUSES, TONE, VERSIONS } from '../model/options';
import { useWorkspace } from '../model/store';
import { Tag } from '../ui/Tag';
import page from './Page.module.css';
import styles from './Overview.module.css';
import { longDate } from './workshop/WorkshopPage';

const TODAY = () => new Date().toISOString().slice(0, 10);

/** Accueil : où en est le cadrage, prochain atelier, couverture des épiques. */
export function Home() {
  const ws = useWorkspace();
  const today = TODAY();
  const nextWorkshop = ws.workshops.find(w => w.date && w.date >= today) ?? ws.workshops[0];
  const questions = ws.workshops.flatMap(w => w.sessions.flatMap(s => s.questions));
  const open = questions.filter(q => q.status === 'Ouvert').length;
  const enriched = ws.stories.filter(
    s => s.body.length || s.comments.length || s.updatedAt !== s.createdAt,
  ).length;
  const byStatus = (list: typeof ws.stories) =>
    STATUSES.map(st => ({ st, n: list.filter(s => s.status === st).length }));

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        🌍
      </span>
      <h1 className={page.h1}>Cadrage eTourisme SGAT</h1>
      <p className={page.lead}>
        Espace de travail du groupement VIEPE × WEVIOO : le backlog des user stories issu du cahier des
        charges v2.1 et le programme des ateliers de cadrage avec le Ministère, SIVIS et Cybastion.
      </p>

      <div className={styles.cards}>
        <Link to="/backlog" className={styles.card}>
          <span className={styles.cardCode}>Backlog</span>
          <span className={styles.stat}>{ws.stories.length}</span>
          <span className={page.faint}>
            user stories, {ws.epics.length} épiques, {enriched} enrichies
          </span>
        </Link>
        <Link to="/backlog?status=Validée" className={styles.card}>
          <span className={styles.cardCode}>Validées</span>
          <span className={styles.stat}>{ws.stories.filter(s => s.status === 'Validée').length}</span>
          <div className={styles.bar} aria-hidden="true">
            {byStatus(ws.stories).map(({ st, n }) => (
              <span
                key={st}
                data-tone={TONE[st]}
                style={{ width: `${(n / Math.max(ws.stories.length, 1)) * 100}%` }}
              />
            ))}
          </div>
        </Link>
        <Link to="/programme?vue=points" className={styles.card}>
          <span className={styles.cardCode}>Points à trancher</span>
          <span className={styles.stat}>{open}</span>
          <span className={page.faint}>ouverts sur {questions.length}</span>
        </Link>
        {nextWorkshop ? (
          <Link to={`/atelier/${nextWorkshop.id}`} className={styles.card}>
            <span className={styles.cardCode}>Prochain atelier · {nextWorkshop.id}</span>
            <strong>{nextWorkshop.title}</strong>
            <span className={page.faint}>{longDate(nextWorkshop.date)}</span>
          </Link>
        ) : null}
      </div>

      <h2 className={page.h2}>Couverture par épique</h2>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th>Épique</th>
              {VERSIONS.map(v => (
                <th key={v}>{v}</th>
              ))}
              <th>Total</th>
              <th>Validées</th>
              <th>Ateliers</th>
            </tr>
          </thead>
          <tbody>
            {ws.epics.map(e => {
              const list = ws.stories.filter(s => s.epic === e.id);
              return (
                <tr key={e.id}>
                  <td>
                    <Link to={`/epic/${e.id}`}>
                      <span className={styles.cardCode}>{e.id}</span> {e.title}
                    </Link>
                  </td>
                  {VERSIONS.map(v => {
                    const n = list.filter(s => s.version === v).length;
                    return (
                      <td key={v}>
                        {n ? (
                          <Link to={`/backlog?epic=${e.id}&version=${encodeURIComponent(v)}`}>{n}</Link>
                        ) : (
                          ''
                        )}
                      </td>
                    );
                  })}
                  <td>{list.length}</td>
                  <td>{list.filter(s => s.status === 'Validée').length}</td>
                  <td>
                    {e.workshops.map(w => (
                      <Tag key={w} value={w} />
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
