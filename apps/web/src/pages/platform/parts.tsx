import type { ReactNode } from 'react';
import styles from './Platform.module.css';

/** Carte chiffrée : un libellé, une valeur, une précision. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className={styles.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/** Liste de propriétés : « libellé — valeur », une par ligne. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className={styles.facts}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v === '' || v === null || v === undefined ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pastille d'état : en service, à configurer, ou simple information. */
export function State({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <span className={styles.state} data-state={ok === null ? 'info' : ok ? 'ok' : 'warn'}>
      {children}
    </span>
  );
}

export const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** Durée lisible : « 3 j 4 h », « 12 min ». */
export function duration(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d} j ${h} h` : h ? `${h} h ${m} min` : `${m} min`;
}
