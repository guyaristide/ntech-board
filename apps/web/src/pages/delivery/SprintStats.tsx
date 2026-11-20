import { useState } from 'react';
import {
  byCount,
  isBlocked,
  isDone,
  stepOf,
  UNIT,
  workdaysLeft,
  type Party,
  type ProjectSettings,
  type Sprint,
  type Ticket,
} from '@board/shared';
import { useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import { Burndown } from './Charts';
import { assigneeName } from './fields';
import { useBurndown } from './usePilotage';
import pilot from './Pilotage.module.css';
import own from './SprintStats.module.css';

const styles = { ...pilot, ...own };
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/**
 * Teinte d'une étape : une seule couleur, de la plus claire (première étape) à la plus franche
 * (dernière) — les étapes sont ordonnées. Mêlée au fond, elle suit le thème clair ou sombre.
 */
const stepColor = (i: number, n: number) =>
  `color-mix(in oklab, var(--accent) ${n > 1 ? Math.round(45 + (55 * i) / (n - 1)) : 100}%, var(--bg))`;

type Measure = 'tickets' | 'estimate';

/**
 * Statistiques d'un sprint : indicateurs, burndown, répartition par étape, par responsable et par
 * type. `tickets` : tickets affichés (filtres du sprint appliqués) ; `all` : tous ceux du sprint.
 */
export function SprintStats({
  settings,
  sprint,
  tickets,
  all,
  allTickets,
}: {
  settings: ProjectSettings;
  sprint: Sprint;
  tickets: Ticket[];
  all: Ticket[];
  allTickets: Ticket[];
}) {
  const parties = useWorkspace(s => s.parties);
  const counting = byCount(settings);
  const [measure, setMeasure] = useState<Measure>(counting ? 'tickets' : 'estimate');
  const m: Measure = counting ? 'tickets' : measure;
  const unit = m === 'tickets' ? 'tickets' : UNIT[settings.delivery.estimation];
  const size = (list: Ticket[]) =>
    m === 'tickets' ? list.length : list.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const chart = useBurndown(settings, sprint, allTickets);

  const done = tickets.filter(t => isDone(settings, t));
  const open = tickets.filter(t => !isDone(settings, t));
  const blocked = open.filter(t => isBlocked(settings, allTickets, t));
  const unassigned = open.filter(t => !t.assignee);
  const unestimated = tickets.filter(t => t.estimate === null);
  const left = sprint.status === 'active' ? workdaysLeft(sprint.end, undefined, sprint.start) : null;

  const steps = settings.delivery.workflow.map((s, i, list) => ({
    key: s.id,
    label: s.name,
    color: stepColor(i, list.length),
    value: size(tickets.filter(t => stepOf(settings, t.status)?.id === s.id)),
  }));
  const people = [...new Set(tickets.map(t => t.assignee))]
    .map(a => {
      const mine = tickets.filter(t => t.assignee === a);
      return {
        key: a || 'aucun',
        label: a ? assigneeName(parties as Party[], a) : 'Non attribué',
        done: size(mine.filter(t => isDone(settings, t))),
        total: size(mine),
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  const types = settings.delivery.ticketTypes
    .map(t => ({ key: t.id, label: t.name, total: size(tickets.filter(x => x.type === t.id)) }))
    .filter(t => t.total)
    .sort((a, b) => b.total - a.total);

  if (!all.length)
    return (
      <p className={page.faint}>Aucun ticket dans ce sprint : les statistiques apparaîtront avec eux.</p>
    );

  return (
    <div className={styles.stats}>
      {counting ? null : (
        <div className={styles.measure} role="group" aria-label="Mesure">
          {(
            [
              ['estimate', `Estimation (${UNIT[settings.delivery.estimation]})`],
              ['tickets', 'Nombre de tickets'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" data-on={m === k || undefined} onClick={() => setMeasure(k)}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Avancement</span>
          <span className={styles.kpiValue}>{pct(size(done), size(tickets))} %</span>
          <span className={page.faint}>
            {fmt(size(done))} sur {fmt(size(tickets))} {unit}
          </span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Reste à faire</span>
          <span className={styles.kpiValue}>{fmt(size(open))}</span>
          <span className={page.faint}>
            {unit}
            {left !== null
              ? ` · ${left} jour${left > 1 ? 's' : ''} ouvré${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}`
              : ''}
          </span>
        </div>
        <div className={styles.kpi} data-alert={blocked.length || undefined}>
          <span className={styles.kpiLabel}>Bloqués</span>
          <span className={styles.kpiValue}>{blocked.length}</span>
          <span className={page.faint}>ticket{blocked.length > 1 ? 's' : ''} en attente d’un autre</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Non attribués</span>
          <span className={styles.kpiValue}>{unassigned.length}</span>
          <span className={page.faint}>parmi les {open.length} à mener</span>
        </div>
        {counting ? null : (
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Non estimés</span>
            <span className={styles.kpiValue}>{unestimated.length}</span>
            <span className={page.faint}>comptent pour zéro</span>
          </div>
        )}
      </div>

      <div className={styles.grid2}>
        <section>
          <h3 className={styles.title}>Par étape</h3>
          <Donut slices={steps} unit={unit} />
        </section>
        <section>
          <h3 className={styles.title}>Burndown</h3>
          {chart ? (
            <>
              <Burndown data={chart} unit={counting ? 'tickets' : UNIT[settings.delivery.estimation]} />
              <p className={page.faint}>Tout le sprint, sans les filtres.</p>
            </>
          ) : (
            <p className={page.faint}>Donnez des dates au sprint pour tracer son burndown.</p>
          )}
        </section>
        <section>
          <h3 className={styles.title}>Par responsable</h3>
          <Bars rows={people} unit={unit} split />
        </section>
        <section>
          <h3 className={styles.title}>Par type</h3>
          <Bars rows={types.map(t => ({ ...t, done: 0 }))} unit={unit} />
        </section>
      </div>
    </div>
  );
}

/** Anneau : la part de chaque étape, total au centre ; la légende sert aussi de tableau. */
function Donut({
  slices,
  unit,
}: {
  slices: { key: string; label: string; color: string; value: number }[];
  unit: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const R = 80;
  const r = 52;
  const C = 100;
  let start = -Math.PI / 2;
  const arcs = slices
    .filter(s => s.value > 0)
    .map(s => {
      const angle = (s.value / total) * Math.PI * 2;
      const a0 = start;
      const a1 = start + angle;
      start = a1;
      const full = angle >= Math.PI * 2 - 1e-6;
      const p = (rad: number, a: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
      const large = angle > Math.PI ? 1 : 0;
      const d = full
        ? `M ${p(R, a0)} A ${R} ${R} 0 1 1 ${p(R, a0 + Math.PI)} A ${R} ${R} 0 1 1 ${p(R, a0)} M ${p(r, a0)} A ${r} ${r} 0 1 0 ${p(r, a0 + Math.PI)} A ${r} ${r} 0 1 0 ${p(r, a0)} Z`
        : `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
      return { ...s, d };
    });
  const focus = slices.find(s => s.key === hover);
  if (!total) return <p className={page.faint}>Rien à compter avec cette mesure.</p>;
  return (
    <figure className={styles.donut}>
      <svg viewBox="0 0 200 200" role="img" aria-label={`Répartition par étape, ${fmt(total)} ${unit}`}>
        {arcs.map(a => (
          <path
            key={a.key}
            d={a.d}
            fill={a.color}
            fillRule="evenodd"
            className={styles.slice}
            data-dim={(hover && hover !== a.key) || undefined}
            onPointerEnter={() => setHover(a.key)}
            onPointerLeave={() => setHover(null)}
          >
            <title>{`${a.label} : ${fmt(a.value)} ${unit} (${pct(a.value, total)} %)`}</title>
          </path>
        ))}
        <text x={C} y={C - 2} textAnchor="middle" className={styles.center}>
          {fmt(focus ? focus.value : total)}
        </text>
        <text x={C} y={C + 18} textAnchor="middle" className={styles.centerLabel}>
          {focus ? focus.label : unit}
        </text>
      </svg>
      <figcaption>
        <table className={styles.legendTable}>
          <tbody>
            {slices.map(s => (
              <tr
                key={s.key}
                data-dim={(hover && hover !== s.key) || undefined}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
              >
                <td>
                  <span className={styles.swatch} style={{ background: s.color }} />
                  {s.label}
                </td>
                <td className={styles.num}>{fmt(s.value)}</td>
                <td className={styles.num}>{pct(s.value, total)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

/** Barres horizontales ; avec `split`, la part terminée en couleur franche et le reste en clair. */
function Bars({
  rows,
  unit,
  split,
}: {
  rows: { key: string; label: string; done: number; total: number }[];
  unit: string;
  split?: boolean;
}) {
  const max = Math.max(0, ...rows.map(r => r.total));
  if (!max) return <p className={page.faint}>Rien à compter avec cette mesure.</p>;
  return (
    <figure className={styles.bars}>
      {rows.map(r => (
        <div
          key={r.key}
          className={styles.barRow}
          title={
            split
              ? `${r.label} : ${fmt(r.done)} terminé sur ${fmt(r.total)} ${unit}`
              : `${r.label} : ${fmt(r.total)} ${unit}`
          }
        >
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barTrack}>
            {split && r.done ? (
              <span className={styles.barDone} style={{ width: `${(r.done / max) * 100}%` }} />
            ) : null}
            {r.total - (split ? r.done : 0) > 0 ? (
              <span
                className={split ? styles.barRest : styles.barDone}
                style={{ width: `${((r.total - (split ? r.done : 0)) / max) * 100}%` }}
              />
            ) : null}
          </span>
          <span className={styles.barValue}>{split ? `${fmt(r.done)} / ${fmt(r.total)}` : fmt(r.total)}</span>
        </div>
      ))}
      {split ? (
        <figcaption className={`${pilot.legend} ${own.restKey}`}>
          <span>Terminé</span>
          <span data-k="rest">Reste à faire</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
