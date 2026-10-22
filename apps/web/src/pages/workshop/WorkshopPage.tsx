import { Link, useNavigate, useParams } from 'react-router-dom';
import { Attachments } from '../../ui/Attachments';
import { programmeOrder, programmeWeeks, PV_STATUSES } from '@board/shared';
import { programme } from '../../model/programme';
import { useCanEdit, useWorkspace } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import type { Workshop } from '@board/shared';
import { BlockEditor } from '../../ui/BlockEditor';
import { Comments } from '../../ui/Comments';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import { StoryList } from '../backlog/Backlog';
import { DiligenceRefs } from '../diligences/Diligences';
import page from '../Page.module.css';
import overview from '../Overview.module.css';
import { Agenda, Deadlines } from './WorkshopEdit';
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
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const w = ws.workshops.find(x => x.id === id);
  if (!w) {
    return (
      <div className={page.page}>
        <h1 className={page.h1}>Atelier introuvable</h1>
        <Link to="/programme">Retour au programme</Link>
      </div>
    );
  }
  const ordered = programmeOrder(ws.workshops);
  const index = ordered.indexOf(w);
  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  const set = (patch: Parameters<typeof ws.updateWorkshop>[1]) => ws.updateWorkshop(w.id, patch);
  const stories = ws.stories.filter(s => s.workshop === w.id);
  const diligences = ws.diligences.filter(d => d.workshops.includes(w.id));
  const epics = ws.epics.filter(e => e.workshops.includes(w.id));
  const questions = w.sessions.flatMap(s => s.questions);
  const settled = questions.filter(q => q.status !== 'Ouvert').length;
  const remove = async () => {
    const linked = stories.length + diligences.length + epics.length;
    const detail = linked
      ? ` Les ${linked} US, épiques et diligences qui y renvoient n’y renverront plus.`
      : '';
    if (
      !confirm(
        `Supprimer l’atelier ${w.id}, ses ${w.sessions.length} séquence(s) et ses points à trancher ?${detail}`,
      )
    )
      return;
    await programme.deleteWorkshop(w.id);
    navigate('/programme');
  };

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
          {canEdit ? (
            <button type="button" className={`${page.ghost} ${page.danger}`} onClick={() => void remove()}>
              Supprimer
            </button>
          ) : null}
        </span>
      </nav>
      <p className={page.kicker}>
        {w.id}
        {w.phase && !canEdit ? ` · ${w.phase}` : ''}
      </p>
      <EditableText
        variant="title"
        multiline={false}
        value={w.title}
        label="Intitulé de l’atelier"
        placeholder="Intitulé de l’atelier"
        onChange={title => set({ title })}
      />
      {canEdit ? (
        <div className={page.props}>
          <span className={page.propLabel}>
            <span aria-hidden="true">▦</span> Date
          </span>
          <div className={page.propValue}>
            <input
              type="date"
              value={w.date ?? ''}
              aria-label="Date de l’atelier"
              onChange={e => set({ date: e.target.value || null })}
            />
            <span className={page.faint}>{w.date ? longDate(w.date) : 'Date à fixer'}</span>
          </div>
          <span className={page.propLabel}>
            <span aria-hidden="true">≡</span> Semaine ou période
          </span>
          <div className={page.propValue}>
            <input
              list="programme-weeks"
              className={styles.phaseInput}
              value={w.phase}
              placeholder="Par exemple « Semaine 1 · du 13 au 16 octobre »"
              aria-label="Semaine ou période"
              onChange={e => set({ phase: e.target.value })}
            />
            <datalist id="programme-weeks">
              {programmeWeeks(ws.workshops).map(p => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>
      ) : (
        <p className={page.lead}>{longDate(w.date)}</p>
      )}

      <div className={page.props}>
        <span className={page.propLabel}>
          <span aria-hidden="true">◉</span> Statut du PV
        </span>
        <div className={page.propValue}>
          <PropertySelect
            label="Statut du PV"
            value={w.pvStatus}
            options={PV_STATUSES}
            onChange={v => v && ws.updateWorkshop(w.id, { pvStatus: v as Workshop['pvStatus'] })}
          />
        </div>
        {w.pvDue || w.deliverableDue || w.validationDue || canEdit ? (
          <>
            <span className={page.propLabel}>
              <span aria-hidden="true">✉︎</span> Échéances
            </span>
            <Deadlines w={w} label={longDate} />
          </>
        ) : null}
        {w.prep.length ? (
          <>
            <span className={page.propLabel}>
              <span aria-hidden="true">?</span> Questionnaires
            </span>
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
            <span className={page.propLabel}>
              <span aria-hidden="true">?</span> Questionnaire
            </span>
            <div className={page.propText}>{w.questionnaire}</div>
          </>
        ) : null}
        <span className={page.propLabel}>
          <span aria-hidden="true">✓</span> Points tranchés
        </span>
        <div className={page.propText}>
          {settled}/{questions.length}
        </div>
      </div>

      {w.objectives.length || canEdit ? (
        <>
          <h2 className={page.h2}>Objectifs</h2>
          {canEdit ? (
            <EditableText
              value={w.objectives.map(o => `- ${o}`).join('\n')}
              label="Objectifs"
              placeholder="Un objectif par ligne"
              onChange={v =>
                set({
                  objectives: v
                    .split('\n')
                    .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <ul className={page.list}>
              {w.objectives.map(o => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
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
      <Agenda w={w} />

      {w.deliverable || canEdit ? (
        <div className={styles.callout}>
          <strong>Livrable</strong>
          <EditableText
            value={w.deliverable}
            label="Livrable"
            placeholder="Ce que l’atelier doit produire"
            onChange={deliverable => set({ deliverable })}
          />
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
        <StoryList stories={stories} exportName={`us-${w.id}`} />
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
      <h2 className={page.h2}>Pièces jointes</h2>
      <Attachments kind="workshop" id={w.id} />
      <h2 className={page.h2}>Commentaires</h2>
      <Comments items={w.comments} onAdd={text => void ws.commentWorkshop(w.id, text)} />
    </div>
  );
}
