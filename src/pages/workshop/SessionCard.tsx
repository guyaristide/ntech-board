import { useState } from 'react';
import { QUESTION_STATUSES } from '../../model/options';
import { useWorkspace } from '../../model/store';
import type { Question, Session } from '../../model/types';
import { BlockEditor } from '../../ui/BlockEditor';
import { EditableText } from '../../ui/EditableText';
import { PropertySelect } from '../../ui/PropertySelect';
import { Tag } from '../../ui/Tag';
import styles from './Workshop.module.css';

const range = (s: { start: string | null; end: string | null }) => (s.start ? `${s.start} à ${s.end}` : '');

/** Une séquence d'atelier : déroulé, responsable, points à trancher avec leur réponse, notes de séance. */
export function SessionCard({ workshop, session }: { workshop: string; session: Session }) {
  const ws = useWorkspace();
  const [steps, setSteps] = useState(false);
  const [draft, setDraft] = useState('');
  const open = session.questions.filter(q => q.status === 'Ouvert').length;
  const setQ = (q: Question, patch: Partial<Question>) =>
    ws.updateQuestion(workshop, session.code, q.id, patch);
  return (
    <article id={session.code} className={styles.session}>
      <div className={styles.time}>{session.allDay ? 'Journée' : range(session)}</div>
      <div className={styles.sessionBody}>
        <header className={styles.sessionHead}>
          <span className={styles.code}>{session.code}</span>
          <h3>{session.title}</h3>
          {session.added ? <Tag value="Séquence ajoutée" tone="orange" /> : null}
        </header>
        {session.content ? <p className={styles.content}>{session.content}</p> : null}
        <dl className={styles.meta}>
          {session.owner ? (
            <>
              <dt>Responsable</dt>
              <dd>{session.owner}</dd>
            </>
          ) : null}
          {session.outcome ? (
            <>
              <dt>Résultat attendu</dt>
              <dd>{session.outcome}</dd>
            </>
          ) : null}
        </dl>

        {session.steps.length ? (
          <>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={steps}
              onClick={() => setSteps(s => !s)}
            >
              {steps ? '▾' : '▸'} Déroulé en {session.steps.length} étapes
            </button>
            {steps ? (
              <ol className={styles.steps}>
                {session.steps.map(st => (
                  <li key={`${st.start}-${st.title}`}>
                    <span className={styles.stepTime}>{range(st)}</span>
                    <span>{st.title}</span>
                    {st.minutes ? <span className={styles.stepMin}>{st.minutes} min</span> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : null}

        <div className={styles.questions}>
          <p className={styles.questionsHead}>
            Points à trancher{' '}
            <span>
              {session.questions.length - open}/{session.questions.length} tranchés
            </span>
          </p>
          {session.questions.map(q => (
            <div key={q.id} className={styles.question} data-status={q.status}>
              <div className={styles.questionLine}>
                <EditableText
                  variant="inline"
                  value={q.text}
                  label="Point à trancher"
                  onChange={text => setQ(q, { text })}
                />
                <PropertySelect
                  label="Statut du point"
                  value={q.status}
                  options={QUESTION_STATUSES}
                  onChange={v => v && setQ(q, { status: v as Question['status'] })}
                />
              </div>
              <EditableText
                variant="inline"
                value={q.answer}
                placeholder="Réponse ou décision prise en séance…"
                label="Réponse"
                onChange={answer =>
                  setQ(q, { answer, status: answer && q.status === 'Ouvert' ? 'Tranché' : q.status })
                }
              />
            </div>
          ))}
          <input
            className={styles.addQuestion}
            value={draft}
            placeholder="+ Ajouter un point à trancher (Entrée)"
            aria-label="Ajouter un point à trancher"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && draft.trim()) {
                ws.addQuestion(workshop, session.code, draft.trim());
                setDraft('');
              }
            }}
          />
        </div>

        <details className={styles.notes} open={session.notes.length > 0 || undefined}>
          <summary>Notes de séance{session.notes.length ? ` (${session.notes.length})` : ''}</summary>
          <BlockEditor
            blocks={session.notes}
            onChange={notes => ws.updateSession(workshop, session.code, { notes })}
            placeholder="Ce qui a été dit, décidé, à suivre…"
          />
        </details>
      </div>
    </article>
  );
}
