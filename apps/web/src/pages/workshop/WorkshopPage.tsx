import { Link, useParams } from 'react-router-dom';
import { PV_STATUSES } from '@board/shared';
import { useWorkspace } from '../../model/store';
import type { Workshop } from '@board/shared';
import { BlockEditor } from '../../ui/BlockEditor';
import { Comments } from '../../ui/Comments';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import { StoryList } from '../backlog/Backlog';
import { DiligenceRefs } from '../diligences/Diligences';
import page from '../Page.module.css';
import overview from '../Overview.module.css';
import { SessionCard } from './SessionCard';
import styles from './Workshop.module.css';

export const longDate = (iso: string | null) =>
  iso
    ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Date à fixer';

/** Page d'un atelier : objectifs, préparation, déroulé de la journée, points à trancher, US à cadrer. */
export function WorkshopPage() {
  const { id = '' } = useParams();
  const ws = useWorkspace();
  const w = ws.workshops.find(x => x.id === id);
  if (!w) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Atelier introuvable</h1>
        <Link to="/programme">Retour au programme</Link>
      </div>
    );
  }
  const index = ws.workshops.indexOf(w);
  const prev = ws.workshops[index - 1];
  const next = ws.workshops[index + 1];
  const stories = ws.stories.filter(s => s.workshop === w.id);
  const diligences = ws.diligences.filter(d => d.workshops.includes(w.id));
  const epics = ws.epics.filter(e => e.workshops.includes(w.id));
  const questions = w.sessions.flatMap(s => s.questions);
  const settled = questions.filter(q => q.status !== 'Ouvert').length;
  const sessionOf = (code: string) => w.sessions.find(s => s.code === code);

  return (
    <div className={page.page}>
      <nav className={page.crumbs} aria-label="Fil d’Ariane">
        <Link to="/programme">Programme des ateliers</Link> / <span>{w.id}</span>
        <span className={page.actions}>
          {prev ? (
            <Link className={page.ghost} to={`/atelier/${prev.id}`}>
              ← {prev.id}
            </Link>
          ) : null}
          {next ? (
            <Link className={page.ghost} to={`/atelier/${next.id}`}>
              {next.id} →
            </Link>
          ) : null}
        </span>
      </nav>
      <p className={page.kicker}>
        {w.id} · {w.phase}
      </p>
      <h1 className={page.h1}>{w.title}</h1>
      <p className={page.lead}>{longDate(w.date)}</p>

      <div className={page.props}>
        <span className={page.propLabel}>◉ Statut du PV</span>
        <div className={page.propValue}>
          <PropertySelect
            label="Statut du PV"
            value={w.pvStatus}
            options={PV_STATUSES}
            onChange={v => v && ws.updateWorkshop(w.id, { pvStatus: v as Workshop['pvStatus'] })}
          />
        </div>
        {w.pvDue ? (
          <>
            <span className={page.propLabel}>✉ Échéances</span>
            <div className={page.propText}>
              PV le {longDate(w.pvDue)} · livrable à SIVIS le {longDate(w.deliverableDue)} · validation
              attendue le {longDate(w.validationDue)}
            </div>
          </>
        ) : null}
        {w.prep.length ? (
          <>
            <span className={page.propLabel}>? Questionnaires</span>
            <div className={page.propText}>
              {w.prep.map(p => (
                <div key={p.tab}>
                  {p.tab}, {p.questions} questions, retour le {longDate(p.due)} <Tag value={p.status} />
                </div>
              ))}
            </div>
          </>
        ) : w.questionnaire ? (
          <>
            <span className={page.propLabel}>? Questionnaire</span>
            <div className={page.propText}>{w.questionnaire}</div>
          </>
        ) : null}
        <span className={page.propLabel}>✓ Points tranchés</span>
        <div className={page.propText}>
          {settled}/{questions.length}
        </div>
      </div>

      {w.objectives.length ? (
        <>
          <h2 className={page.h2}>Objectifs</h2>
          <ul className={page.list}>
            {w.objectives.map(o => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </>
      ) : null}

      {w.raci.length || w.risks.length ? (
        <div className={styles.callout}>
          {w.raci.length ? (
            <>
              <strong>RACI</strong>
              <ul>
                {w.raci.map(r => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          {w.risks.length ? (
            <p>
              <strong>Risques à suivre</strong> :{' '}
              {w.risks.map((r, i) => {
                const risk = ws.risks.find(x => x.id === r.split(' ')[0]);
                return (
                  <span key={r}>
                    {i ? ' · ' : ''}
                    {risk ? (
                      <Link to={`/risque/${risk.id}`} title={risk.title}>
                        {r}
                      </Link>
                    ) : (
                      r
                    )}
                  </span>
                );
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <h2 className={page.h2}>Déroulé</h2>
      <div className={styles.agenda}>
        {w.agenda.map((item, i) => {
          if (item.kind === 'break') {
            return (
              <div key={`b-${i}`} className={styles.break}>
                <span className={styles.time}>{item.start ? `${item.start} à ${item.end}` : ''}</span>
                <span>{item.title}</span>
              </div>
            );
          }
          const s = sessionOf(item.code);
          return s ? <SessionCard key={s.code} workshop={w.id} session={s} /> : null;
        })}
      </div>

      {w.deliverable ? (
        <div className={styles.callout}>
          <strong>Livrable</strong>
          <p>{w.deliverable}</p>
          {w.pv ? <p className={page.faint}>{w.pv}</p> : null}
        </div>
      ) : null}

      <h2 className={page.h2}>User stories à cadrer ({stories.length})</h2>
      {epics.length ? (
        <p className={overview.inline}>
          <span className={page.faint}>Épiques :</span>
          {epics.map(e => (
            <Link key={e.id} to={`/epic/${e.id}`} className={overview.chip}>
              {e.id} {e.title}
            </Link>
          ))}
        </p>
      ) : null}
      {stories.length ? (
        <StoryList stories={stories} />
      ) : (
        <p className={page.faint}>Aucune US rattachée à cet atelier.</p>
      )}

      {diligences.length ? (
        <>
          <h2 className={page.h2}>Diligences issues de l’atelier ({diligences.length})</h2>
          <DiligenceRefs items={diligences} />
        </>
      ) : null}

      <h2 className={page.h2}>Notes de l’atelier</h2>
      <BlockEditor
        blocks={w.notes}
        onChange={notes => ws.updateWorkshop(w.id, { notes })}
        placeholder="Synthèse, décisions, actions…"
      />
      <h2 className={page.h2}>Commentaires</h2>
      <Comments items={w.comments} onAdd={text => void ws.commentWorkshop(w.id, text)} />
    </div>
  );
}
