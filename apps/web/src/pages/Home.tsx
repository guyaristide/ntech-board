import { Link } from 'react-router-dom';
import { diligenceOpen, STATUSES, TONE, versionsOf } from '@board/shared';
import { overdue } from '../model/due';
import { useWorkspace } from '../model/store';
import { ExportButton, type Column } from '../ui/ExportButton';
import { Tag } from '../ui/Tag';
import { HomeDelivery } from './delivery/HomeDelivery';
import page from './Page.module.css';
import styles from './Overview.module.css';
import { longDate } from './workshop/WorkshopPage';

const TODAY = () => new Date().toISOString().slice(0, 10);

/** Accueil : où en est le cadrage, diligences, prochain atelier, couverture par plateforme et par épique. */
export function Home() {
  const ws = useWorkspace();
  const versions = versionsOf(ws.settings);
  const today = TODAY();
  const nextWorkshop = ws.workshops.find(w => w.date && w.date >= today) ?? ws.workshops[0];
  const questions = ws.workshops.flatMap(w => w.sessions.flatMap(s => s.questions));
  const open = questions.filter(q => q.status === 'Ouvert').length;
  const enriched = ws.stories.filter(
    s => s.body.length || s.comments.length || s.updatedAt !== s.createdAt,
  ).length;
  const toDo = ws.diligences.filter(d => diligenceOpen(d.status));
  const platforms = [...new Set(ws.stories.flatMap(s => s.targets.map(t => t.platform)))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const onPlatform = (p: string) => ws.stories.filter(s => s.targets.some(t => t.platform === p));
  const validated = (list: typeof ws.stories) => list.filter(s => s.status === 'Validée').length;
  const platformColumns: Column<string>[] = [
    ['Plateforme', p => p],
    ...versions.map((v): Column<string> => [v, p => onPlatform(p).filter(s => s.version === v).length]),
    ['Total', p => onPlatform(p).length],
    ['Validées', p => validated(onPlatform(p))],
  ];
  const ofEpic = (id: string) => ws.stories.filter(s => s.epic === id);
  const epicColumns: Column<(typeof ws.epics)[number]>[] = [
    ['Épique', e => e.id],
    ['Intitulé', e => e.title],
    ...versions.map((v): Column<(typeof ws.epics)[number]> => [
      v,
      e => ofEpic(e.id).filter(s => s.version === v).length,
    ]),
    ['Total', e => ofEpic(e.id).length],
    ['Validées', e => validated(ofEpic(e.id))],
    ['Ateliers', e => e.workshops.join(', ')],
  ];
  const byStatus = (list: typeof ws.stories) =>
    STATUSES.map(st => ({ st, n: list.filter(s => s.status === st).length }));

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        🌍
      </span>
      <h1 className={page.h1}>{ws.session?.project.title}</h1>
      <p className={page.lead}>
        {ws.session?.project.subtitle || 'Backlog des user stories et programme des ateliers de cadrage.'}
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
          <span className={page.faint}>sur {ws.stories.length} US, par statut</span>
        </Link>
        <Link to="/programme?vue=points" className={styles.card}>
          <span className={styles.cardCode}>Points à trancher</span>
          <span className={styles.stat}>{open}</span>
          <span className={page.faint}>ouverts sur {questions.length}</span>
        </Link>
        {ws.diligences.length ? (
          <Link to="/diligences?statut=ouvertes" className={styles.card}>
            <span className={styles.cardCode}>Diligences</span>
            <span className={styles.stat}>{toDo.length}</span>
            <span className={page.faint}>
              à mener sur {ws.diligences.length}
              {toDo.some(d => overdue(d.due)) ? `, ${toDo.filter(d => overdue(d.due)).length} en retard` : ''}
            </span>
          </Link>
        ) : null}
        {nextWorkshop ? (
          <Link to={`/atelier/${nextWorkshop.id}`} className={styles.card}>
            <span className={styles.cardCode}>Prochain atelier · {nextWorkshop.id}</span>
            <strong>{nextWorkshop.title}</strong>
            <span className={page.faint}>{longDate(nextWorkshop.date)}</span>
          </Link>
        ) : null}
      </div>

      <HomeDelivery />

      {platforms.length ? (
        <>
          <div className={styles.weekHead}>
            <h2 className={page.h2}>Couverture par plateforme</h2>
            <span className={page.actions}>
              <ExportButton
                name="couverture-plateformes"
                rows={platforms}
                columns={platformColumns}
                noun="plateformes"
              />
            </span>
          </div>
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th>Plateforme</th>
                  {versions.map(v => (
                    <th key={v}>{v}</th>
                  ))}
                  <th>Total</th>
                  <th>Validées</th>
                </tr>
              </thead>
              <tbody>
                {platforms.map(p => {
                  const list = onPlatform(p);
                  const q = `platform=${encodeURIComponent(p)}`;
                  return (
                    <tr key={p}>
                      <td>
                        <Link to={`/backlog?${q}`}>{p}</Link>
                      </td>
                      {versions.map(v => {
                        const n = list.filter(s => s.version === v).length;
                        return (
                          <td key={v}>
                            {n ? <Link to={`/backlog?${q}&version=${encodeURIComponent(v)}`}>{n}</Link> : ''}
                          </td>
                        );
                      })}
                      <td>{list.length}</td>
                      <td>{list.filter(s => s.status === 'Validée').length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={page.faint}>
            Une US peut viser plusieurs plateformes : elle compte dans chacune.{' '}
            {ws.stories.filter(s => !s.targets.length).length
              ? `${ws.stories.filter(s => !s.targets.length).length} US sans plateforme.`
              : ''}
          </p>
        </>
      ) : null}

      <div className={styles.weekHead}>
        <h2 className={page.h2}>Couverture par épique</h2>
        <span className={page.actions}>
          <ExportButton name="couverture-epiques" rows={ws.epics} columns={epicColumns} noun="épiques" />
        </span>
      </div>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th>Épique</th>
              {versions.map(v => (
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
                  {versions.map(v => {
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
                    <span className={styles.tags}>
                      {e.workshops.map(w => (
                        <Tag key={w} value={w} />
                      ))}
                    </span>
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
