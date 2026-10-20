import { burndown, delivered, type Sprint } from '@board/shared';
import styles from './Pilotage.module.css';

const W = 520;
const H = 220;
const PAD = { l: 34, r: 14, t: 14, b: 28 };
const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** Graduations « rondes » de l'axe vertical, jusqu'à la première au-dessus du maximum. */
function ticks(max: number) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => max / s <= 5) ?? Math.ceil(max / 5);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(v);
  return out;
}

/** Burndown : reste à faire par jour ouvré, périmètre, et droite idéale. */
export function Burndown({ data, unit }: { data: NonNullable<ReturnType<typeof burndown>>; unit: string }) {
  const n = data.points.length;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const max = Math.max(...ticks(data.max));
  const x = (i: number) => PAD.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const path = (pick: (i: number) => number | null) =>
    data.points
      .map((_, i) => pick(i))
      .map((v, i) => (v === null ? '' : `${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(' ');
  const every = Math.max(1, Math.ceil(n / 6));
  // Un repère tous les `every` jours, et le dernier jour, sans qu'il touche le précédent.
  const labelled = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= Math.ceil(every * 0.75));
  const anchor = (i: number) => (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle');
  const last = data.points.findLastIndex(p => p.remaining !== null);
  return (
    <figure className={styles.chart}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Burndown : ${last >= 0 ? fmt(data.points[last].remaining!) : '—'} ${unit} restant`}
      >
        {ticks(data.max).map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={styles.grid} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className={styles.axis}>
              {fmt(v)}
            </text>
          </g>
        ))}
        {data.points.map((p, i) =>
          labelled(i) ? (
            <text key={p.day} x={x(i)} y={H - 8} textAnchor={anchor(i)} className={styles.axis}>
              {day(p.day)}
            </text>
          ) : null,
        )}
        <line x1={x(0)} y1={y(data.start)} x2={x(n - 1)} y2={y(0)} className={styles.ideal} />
        <polyline points={path(i => data.points[i].scope)} className={styles.scope} />
        <polyline points={path(i => data.points[i].remaining)} className={styles.remaining} />
        {data.points.map((p, i) =>
          p.remaining === null ? null : (
            <circle key={p.day} cx={x(i)} cy={y(p.remaining)} r={i === last ? 4 : 2.5} className={styles.dot}>
              <title>{`${day(p.day)} : ${fmt(p.remaining)} ${unit} restant, périmètre ${fmt(p.scope ?? 0)}`}</title>
            </circle>
          ),
        )}
      </svg>
      <figcaption className={styles.legend}>
        <span data-k="remaining">Reste à faire</span>
        <span data-k="scope">Périmètre</span>
        <span data-k="ideal">Rythme idéal</span>
      </figcaption>
    </figure>
  );
}

/** Vélocité : livré par sprint clos, capacité prévue en filigrane, moyenne des trois derniers. */
export function Velocity({
  sprints,
  count,
  average,
  unit,
}: {
  sprints: Sprint[];
  count: boolean;
  average: number | null;
  unit: string;
}) {
  const list = sprints.slice(-8);
  const values = list.map(s => ({ s, v: delivered(s, count) ?? 0, cap: count ? null : s.capacity }));
  const max = Math.max(...ticks(Math.max(1, ...values.map(x => Math.max(x.v, x.cap ?? 0)))));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(list.length, 1);
  const bw = Math.min(48, slot * 0.6);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  return (
    <figure className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vélocité par sprint">
        {ticks(max).map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className={styles.grid} />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className={styles.axis}>
              {fmt(v)}
            </text>
          </g>
        ))}
        {values.map(({ s, v, cap }, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          return (
            <g key={s.id}>
              {cap ? (
                <rect
                  x={cx - bw / 2}
                  y={y(cap)}
                  width={bw}
                  height={y(0) - y(cap)}
                  className={styles.capacity}
                />
              ) : null}
              <rect x={cx - bw / 2 + 4} y={y(v)} width={bw - 8} height={y(0) - y(v)} className={styles.done}>
                <title>{`${s.name} : ${fmt(v)} ${unit} livré${cap ? ` pour ${fmt(cap)} prévu` : ''}`}</title>
              </rect>
              <text x={cx} y={y(v) - 4} textAnchor="middle" className={styles.value}>
                {fmt(v)}
              </text>
              <text x={cx} y={H - 8} textAnchor="middle" className={styles.axis}>
                {s.name.replace(/^Sprint\s*/i, 'S')}
              </text>
            </g>
          );
        })}
        {average !== null ? (
          <line x1={PAD.l} x2={W - PAD.r} y1={y(average)} y2={y(average)} className={styles.average} />
        ) : null}
      </svg>
      <figcaption className={styles.legend}>
        <span data-k="done">Livré</span>
        {count ? null : <span data-k="capacity">Capacité prévue</span>}
        {average !== null ? (
          <span data-k="average">
            Moyenne des 3 derniers : {fmt(average)} {unit}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
