import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { programmeOrder, programmeWeeks, QUESTION_STATUSES } from '@board/shared';
import { programme } from '../model/programme';
import { useCanEdit, useWorkspace } from '../model/store';
import type { Question, Session, Workshop } from '@board/shared';
import { EditableText } from '../ui/EditableText';
import { ExportButton, type Column } from '../ui/ExportButton';
import { PropertySelect } from '../ui/PropertySelect';
import { PdfButton } from '../ui/PdfButton';
import { Tag } from '../ui/Tag';
import { frDate } from './exportFormat';
import page from './Page.module.css';
import styles from './Overview.module.css';
import backlog from './backlog/Backlog.module.css';
import { longDate } from './workshop/WorkshopPage';

/** Programme des ateliers : calendrier des journées et registre consolidé des points à trancher. */
export function Programme() {
  const ws = useWorkspace();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('vue') === 'points' ? 'points' : 'calendar';
  const status = params.get('statut') ?? 'Ouvert';
  const ordered = programmeOrder(ws.workshops);
  const phases = programmeWeeks(ws.workshops);
  const dates = ordered
    .map(w => w.date)
    .filter((d): d is string => !!d)
    .sort();
  const span = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const create = async (phase?: string) =>
    navigate(`/atelier/${await programme.createWorkshop({ phase: phase ?? phases.at(-1) ?? '' })}`);
  const all = ws.workshops.flatMap(w => w.sessions.flatMap(s => s.questions.map(q => ({ w, s, q }))));
  const shown = all.filter(x => status === 'Tous' || x.q.status === status);
  const workshopColumns: Column<Workshop>[] = [
    ['Atelier', w => w.id],
    ['Date', w => frDate(w.date)],
    ['Semaine', w => w.phase],
    ['Intitulé', w => w.title],
    ['Séquences', w => w.sessions.length],
    ['US', w => ws.stories.filter(s => s.workshop === w.id).length],
    ['Points tranchés', w => w.sessions.flatMap(s => s.questions).filter(q => q.status !== 'Ouvert').length],
    ['Points', w => w.sessions.flatMap(s => s.questions).length],
    ['Statut du PV', w => w.pvStatus],
  ];
  const pointColumns: Column<{ w: Workshop; s: Session; q: Question }>[] = [
    ['Atelier', x => x.w.id],
    ['Séquence', x => x.s.code],
    ['Intitulé de la séquence', x => x.s.title],
    ['Point à trancher', x => x.q.text],
    ['Réponse', x => x.q.answer],
    ['Statut', x => x.q.status],
  ];

  return (
    <div className={`${page.page} ${page.wide}`}>
      <span className={page.icon} aria-hidden="true">
        🗓️
      </span>
      <h1 className={page.h1}>Programme des ateliers</h1>
      <p className={page.lead}>
        {ws.workshops.length
          ? `${ws.workshops.length} atelier${ws.workshops.length > 1 ? 's' : ''}${dates.length ? `, du ${span(dates[0])} au ${span(dates.at(-1)!)}` : ''} · ${all.length - all.filter(x => x.q.status === 'Ouvert').length}/${all.length} points tranchés.`
          : 'Les journées d’atelier, leurs séquences et les points à trancher.'}
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
          {tab === 'calendar' ? (
            <ExportButton name="ateliers" rows={ordered} columns={workshopColumns} noun="ateliers" />
          ) : (
            <ExportButton
              name="points-a-trancher"
              rows={shown}
              columns={pointColumns}
              filtered={shown.length !== all.length}
              noun="points"
            />
          )}
          {canEdit ? (
            <button type="button" className={page.primary} onClick={() => void create()}>
              + Atelier
            </button>
          ) : null}
          <PdfButton
            path="/pdf/couverture"
            title="Couverture de tous les cas d’usage par les ateliers du programme"
          >
            ⤓ PDF couverture des UC
          </PdfButton>
        </span>
      </div>

      {tab === 'calendar' && !ws.workshops.length ? (
        <div className={page.emptyState}>
          <strong>Aucun atelier pour le moment</strong>
          <p>
            Créez les journées une à une : date, semaine, objectifs, puis leurs séquences et pauses. Un
            planning Excel peut aussi être importé depuis Administration.
          </p>
          {canEdit ? (
            <button type="button" className={page.primary} onClick={() => void create('')}>
              + Premier atelier
            </button>
          ) : null}
        </div>
      ) : tab === 'calendar' ? (
        phases.map((phase, i) => (
          <section key={phase}>
            <div className={styles.weekHead}>
              <h2 className={page.h2}>{phase || 'Sans semaine'}</h2>
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
              {ordered
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
