import { Link, useSearchParams } from 'react-router-dom';
import { QUESTION_STATUSES } from '@board/shared';
import { useWorkspace } from '../model/store';
import type { Question } from '@board/shared';
import { EditableText } from '../ui/EditableText';
import { PropertySelect } from '../ui/PropertySelect';
import { PdfButton } from '../ui/PdfButton';
import { Tag } from '../ui/Tag';
import page from './Page.module.css';
import styles from './Overview.module.css';
import backlog from './backlog/Backlog.module.css';
import { longDate } from './workshop/WorkshopPage';

/** Programme des ateliers : calendrier des journées et registre consolidé des points à trancher. */
export function Programme() {
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = params.get('vue') === 'points' ? 'points' : 'calendar';
  const status = params.get('statut') ?? 'Ouvert';
  const phases = [...new Set(ws.workshops.map(w => w.phase))];
  const all = ws.workshops.flatMap(w => w.sessions.flatMap(s => s.questions.map(q => ({ w, s, q }))));
  const shown = all.filter(x => status === 'Tous' || x.q.status === status);

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        🗓️
      </span>
      <h1 className={page.h1}>Programme des ateliers</h1>
      <p className={page.lead}>
        Journées de cadrage d’Abidjan du 13 au 23 octobre 2026, puis cadrage complémentaire de la V2 en
        janvier 2027. {all.length - all.filter(x => x.q.status === 'Ouvert').length}/{all.length} points
        tranchés.
      </p>
      <div className={backlog.toolbar}>
        <div className={backlog.views} role="tablist" aria-label="Vue">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'calendar'}
            className={backlog.view}
            onClick={() => setParams({})}
          >
            ▦ Calendrier
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'points'}
            className={backlog.view}
            onClick={() => setParams({ vue: 'points' })}
          >
            ◇ Points à trancher
          </button>
        </div>
        <span className={page.actions}>
          <PdfButton
            path="/pdf/couverture"
            title="Couverture de tous les cas d’usage par les ateliers du programme"
          >
            ⤓ PDF couverture des UC
          </PdfButton>
        </span>
      </div>

      {tab === 'calendar' ? (
        phases.map((phase, i) => (
          <section key={phase}>
            <div className={styles.weekHead}>
              <h2 className={page.h2}>{phase}</h2>
              <span className={page.actions}>
                <PdfButton
                  path={`/pdf/semaine/${i + 1}`}
                  title="Planning de la semaine : vue d’ensemble et ordre du jour"
                >
                  ⤓ PDF synthèse
                </PdfButton>
                <PdfButton
                  path={`/pdf/semaine/${i + 1}?deroule=1`}
                  title="Planning de la semaine avec le déroulé de chaque journée"
                >
                  ⤓ PDF avec déroulé
                </PdfButton>
                <PdfButton
                  path={`/pdf/couverture?semaine=${i + 1}`}
                  title="Cas d’usage traités cette semaine : journée, atelier et séquences"
                >
                  ⤓ PDF couverture des UC
                </PdfButton>
              </span>
            </div>
            <div className={styles.cards}>
              {ws.workshops
                .filter(w => w.phase === phase)
                .map(w => {
                  const qs = w.sessions.flatMap(s => s.questions);
                  const done = qs.filter(q => q.status !== 'Ouvert').length;
                  const us = ws.stories.filter(s => s.workshop === w.id).length;
                  return (
                    <Link key={w.id} to={`/atelier/${w.id}`} className={styles.card}>
                      <span className={styles.cardHead}>
                        <span className={styles.cardCode}>{w.id}</span>
                        <span className={page.faint}>{longDate(w.date)}</span>
                      </span>
                      <strong>{w.title}</strong>
                      <span className={page.faint}>
                        {w.sessions.length} séquence{w.sessions.length > 1 ? 's' : ''} · {us} US · {done}/
                        {qs.length} points tranchés
                      </span>
                      <span>
                        <Tag value={w.pvStatus}>{`PV : ${w.pvStatus}`}</Tag>
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        ))
      ) : (
        <>
          <div className={backlog.filters}>
            {['Ouvert', 'Tranché', 'Reporté', 'Tous'].map(s => (
              <button
                key={s}
                type="button"
                className={backlog.filter}
                data-on={status === s || undefined}
                onClick={() => setParams({ vue: 'points', statut: s })}
              >
                {s} · {s === 'Tous' ? all.length : all.filter(x => x.q.status === s).length}
              </button>
            ))}
          </div>
          <div className={backlog.tableWrap}>
            <table className={backlog.table} style={{ minWidth: 820 }}>
              <colgroup>
                <col style={{ width: '90px' }} />
                <col />
                <col />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Séquence</th>
                  <th>Point à trancher</th>
                  <th>Réponse</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ w, s, q }) => (
                  <tr key={q.id}>
                    <td>
                      <Link to={`/atelier/${w.id}#${s.code}`} className={backlog.mono} title={s.title}>
                        {s.code}
                      </Link>
                    </td>
                    <td>{q.text}</td>
                    <td>
                      <EditableText
                        variant="inline"
                        value={q.answer}
                        placeholder="Réponse…"
                        label="Réponse"
                        markdown
                        onChange={answer =>
                          ws.updateQuestion(w.id, s.code, q.id, {
                            answer,
                            status: answer && q.status === 'Ouvert' ? 'Tranché' : q.status,
                          })
                        }
                      />
                    </td>
                    <td>
                      <PropertySelect
                        label="Statut du point"
                        value={q.status}
                        options={QUESTION_STATUSES}
                        onChange={v =>
                          v && ws.updateQuestion(w.id, s.code, q.id, { status: v as Question['status'] })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {!shown.length ? (
                  <tr>
                    <td colSpan={4} className={backlog.empty}>
                      Aucun point dans cet état.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
