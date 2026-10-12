import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Workshop } from '@board/shared';
import { useWorkspace } from '../../model/store';
import {
  agendaOf,
  capitalize,
  cssString,
  dayLabel,
  describeWeek,
  hours,
  shortDate,
  slot,
  weeksOf,
} from './weekPlan';
import styles from './WeekPrint.module.css';

/** Page de garde et vue d'ensemble de la semaine. */
function Cover({
  project,
  week,
  workshops,
}: {
  project: string;
  week: ReturnType<typeof describeWeek>;
  workshops: Workshop[];
}) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const span = hours(workshops);
  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>{project}</div>
      <h1 className={styles.h1}>Planning des ateliers</h1>
      <div className={styles.sub}>{week.label}</div>
      <dl className={styles.meta}>
        {week.details ? (
          <>
            <dt>Modalités</dt>
            <dd>{capitalize(week.details)}</dd>
          </>
        ) : null}
        <dt>Ateliers</dt>
        <dd>
          {workshops.length} journée{workshops.length > 1 ? 's' : ''}
          {span ? `, de ${span}` : ''}
        </dd>
        <dt>Version</dt>
        <dd>Document de travail du {today}</dd>
      </dl>
      <h2 className={styles.h2}>Vue d’ensemble</h2>
      <table className={styles.table}>
        <colgroup>
          <col style={{ width: '17%' }} />
          <col style={{ width: '29%' }} />
          <col />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Atelier</th>
            <th>Livrable attendu</th>
            <th className={styles.right}>PV</th>
            <th className={styles.right}>Livrable</th>
          </tr>
        </thead>
        <tbody>
          {workshops.map(w => (
            <tr key={w.id}>
              <td>
                {capitalize(dayLabel(w.date))}
                <span className={styles.codeBlock}>{w.id}</span>
              </td>
              <td className={styles.strong}>{w.title}</td>
              <td>{w.deliverable}</td>
              <td className={styles.right}>{shortDate(w.pvDue)}</td>
              <td className={styles.right}>{shortDate(w.deliverableDue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Version courte : l'ordre du jour de chaque journée. */
function Agendas({ workshops }: { workshops: Workshop[] }) {
  return (
    <section className={styles.section}>
      <h2 className={`${styles.h2} ${styles.top}`}>Ordre du jour</h2>
      {workshops.map(w => (
        <div key={w.id} className={styles.day}>
          <h3 className={styles.h3}>
            {capitalize(dayLabel(w.date))} · {w.id} · {w.title}
          </h3>
          <table className={`${styles.table} ${styles.compact}`}>
            <colgroup>
              <col style={{ width: '17%' }} />
              <col />
              <col style={{ width: '32%' }} />
            </colgroup>
            <tbody>
              {agendaOf(w).map((it, i) =>
                it.kind === 'break' ? (
                  <tr key={i} className={styles.break}>
                    <td>{slot(it)}</td>
                    <td colSpan={2}>{it.title}</td>
                  </tr>
                ) : (
                  <tr key={it.s.code}>
                    <td>{slot(it.s)}</td>
                    <td>{it.s.title}</td>
                    <td className={styles.muted}>{it.s.owner}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

/** Version complète : une partie par journée, avec le déroulé de chaque séquence. */
function Day({ w }: { w: Workshop }) {
  return (
    <section className={styles.section}>
      <div className={styles.eyebrow}>
        {capitalize(dayLabel(w.date))} · Atelier {w.id}
      </div>
      <h1 className={`${styles.h1} ${styles.dayTitle}`}>{w.title}</h1>
      <div className={styles.two}>
        <div>
          <h2 className={styles.h2}>Objectifs</h2>
          <ul>
            {w.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
        <div>
          {w.raci.length ? (
            <>
              <h2 className={styles.h2}>Responsabilités</h2>
              <ul>
                {w.raci.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          ) : null}
          {w.risks.length ? (
            <>
              <h2 className={styles.h2}>Risques suivis</h2>
              <p>{w.risks.join(', ')}</p>
            </>
          ) : null}
        </div>
      </div>
      <h2 className={styles.h2}>Déroulé</h2>
      {agendaOf(w).map((it, i) => {
        if (it.kind === 'break')
          return (
            <div key={i} className={`${styles.slot} ${styles.break}`}>
              <div className={styles.time}>{slot(it)}</div>
              <div>{it.title}</div>
            </div>
          );
        const s = it.s;
        const open = s.questions.filter(q => q.status !== 'Tranché');
        const decided = s.questions.filter(q => q.status === 'Tranché');
        return (
          <div key={s.code} className={styles.slot}>
            <div className={styles.time}>{slot(s)}</div>
            <div>
              <div className={styles.strong}>
                {s.title} <span className={styles.code}>{s.code}</span>
              </div>
              {s.content ? <div className={styles.muted}>{s.content}</div> : null}
              {s.steps.length ? (
                <ul className={styles.steps}>
                  {s.steps.map((st, j) => (
                    <li key={j}>
                      <span>{slot({ start: st.start, end: null })}</span>
                      {st.title}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className={styles.facts}>
                {s.owner ? (
                  <span>
                    <em>Porteur</em> {s.owner}
                  </span>
                ) : null}
                {s.outcome ? (
                  <span>
                    <em>Résultat attendu</em> {s.outcome}
                  </span>
                ) : null}
                {open.length ? (
                  <span>
                    <em>Questions à trancher</em> {open.map(q => q.text).join(' · ')}
                  </span>
                ) : null}
                {decided.map(q => (
                  <span key={q.id}>
                    <em>Décision</em> {q.text}
                    {q.answer ? ` : ${q.answer}` : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div className={styles.close}>
        <h2 className={styles.h2}>Livrable et engagement</h2>
        {w.deliverable ? <p>{w.deliverable}</p> : null}
        {w.pv ? <p>{w.pv}</p> : null}
        <p className={styles.muted}>
          PV attendu le {shortDate(w.pvDue)} · livrable le {shortDate(w.deliverableDue)} · validation le{' '}
          {shortDate(w.validationDue)}
        </p>
      </div>
    </section>
  );
}

/**
 * Planning d'une semaine d'ateliers mis en page pour l'impression : « Enregistrer en PDF » dans la
 * boîte d'impression du navigateur. `?semaine=n` (rang dans le programme) et `deroule=1` pour le détail.
 */
export function WeekPrint() {
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const weeks = weeksOf(ws.workshops);
  const n = Math.min(Math.max(Number(params.get('semaine')) || 1, 1), weeks.length || 1);
  const detail = params.get('deroule') === '1';
  const phase = weeks[n - 1];
  const workshops = ws.workshops.filter(w => w.phase === phase);
  const project = ws.session?.project.title ?? '';
  const week = describeWeek(phase ?? '', workshops);
  const footer = [project, 'Planning des ateliers', week.label].filter(Boolean).join(' · ');

  useEffect(() => {
    const title = document.title;
    document.title = `Planning des ateliers · ${week.title}${detail ? ' · déroulé' : ''}`;
    return () => void (document.title = title);
  }, [week.title, detail]);

  if (!phase) return <p className={styles.empty}>Aucun atelier au programme.</p>;
  return (
    <div className={styles.screen}>
      <style>{`@page { @bottom-left { content: ${cssString(footer)}; } }`}</style>
      <div className={styles.toolbar}>
        <Link to="/programme">← Programme</Link>
        <select
          aria-label="Semaine"
          value={n}
          onChange={e => setParams({ semaine: e.target.value, ...(detail ? { deroule: '1' } : {}) })}
        >
          {weeks.map((p, i) => (
            <option key={p} value={i + 1}>
              {
                describeWeek(
                  p,
                  ws.workshops.filter(w => w.phase === p),
                ).title
              }
            </option>
          ))}
        </select>
        <span className={styles.switch} role="group" aria-label="Contenu">
          <button
            type="button"
            data-on={!detail || undefined}
            onClick={() => setParams({ semaine: String(n) })}
          >
            Synthèse
          </button>
          <button
            type="button"
            data-on={detail || undefined}
            onClick={() => setParams({ semaine: String(n), deroule: '1' })}
          >
            Avec déroulé
          </button>
        </span>
        <button type="button" className={styles.primary} onClick={() => window.print()}>
          Imprimer ou enregistrer en PDF
        </button>
      </div>
      <article className={styles.doc}>
        <Cover project={project} week={week} workshops={workshops} />
        {detail ? workshops.map(w => <Day key={w.id} w={w} />) : <Agendas workshops={workshops} />}
      </article>
    </div>
  );
}
