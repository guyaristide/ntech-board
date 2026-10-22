import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  amount,
  progress,
  RELEASE_STATUSES,
  OUT_OF_SCOPE,
  versionsOf,
  type Release,
  type ReleaseStatus,
  type Sprint,
} from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import { EditableText } from '../../ui/EditableText';
import { ExportButton } from '../../ui/ExportButton';
import { Tag } from '../../ui/Tag';
import page from '../Page.module.css';
import { useReleaseColumns } from './exports';
import { DeliveryGate, period, sprintOrder } from './parts';
import { ReleaseSprints, SprintPlanner, type PlanMode } from './ReleaseSprints';
import styles from './Delivery.module.css';
import tl from './Timeline.module.css';

const time = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

/** Largeur affichée d'un élément, suivie au redimensionnement. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Répartit des barres sur des sous-pistes pour qu'aucune ne recouvre une autre. */
function lanes<T extends { start: string | null; end: string | null }>(items: T[]) {
  const ends: string[] = [];
  return [...items]
    .sort((a, b) => (a.start ?? a.end ?? '').localeCompare(b.start ?? b.end ?? ''))
    .map(item => {
      const from = item.start ?? item.end ?? '';
      let row = ends.findIndex(e => e < from);
      if (row < 0) row = ends.length;
      ends[row] = item.end ?? item.start ?? '';
      return { item, row };
    });
}

/** Frise : versions et sprints sur l'axe du temps, un repère par mois et la date du jour. */
function Timeline({ releases, sprints }: { releases: Release[]; sprints: Sprint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const dated = [...releases, ...sprints].filter(x => x.start || x.end);
  if (!dated.length) return null;
  const dates = dated
    .flatMap(x => [x.start, x.end])
    .filter((d): d is string => !!d)
    .sort();
  const from = time(dates[0]);
  const to = Math.max(time(dates.at(-1)!), from + 30 * 86_400_000);
  const pos = (iso: string) => ((time(iso) - from) / (to - from)) * 100;
  const bar = (x: { start: string | null; end: string | null }) => {
    const a = pos(x.start ?? x.end!);
    const b = pos(x.end ?? x.start!);
    return { left: `${a}%`, width: `${Math.max(b - a, 1)}%` };
  };
  // Repères : chaque début de mois compris dans la frise, espacés d'au moins 56 px à l'écran.
  const axisWidth = Math.max(width - 120, 1);
  const months: { m: Date; left: number }[] = [];
  const first = new Date(from);
  for (
    let d = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    d.getTime() <= to;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    const left = ((d.getTime() - from) / (to - from)) * 100;
    const prev = months.at(-1);
    if (!prev || ((left - prev.left) / 100) * axisWidth >= 56) months.push({ m: d, left });
  }
  const label = (m: Date, i: number) =>
    m.toLocaleDateString(
      'fr-FR',
      i === 0 || m.getMonth() === 0 ? { month: 'short', year: 'numeric' } : { month: 'short' },
    );
  const today = new Date().toISOString().slice(0, 10);
  const placed = lanes(sprints.filter(s => s.start || s.end));
  const rows = Math.max(1, ...placed.map(p => p.row + 1));
  return (
    <div ref={ref} className={tl.timeline} aria-label="Frise des versions et des sprints">
      <div className={tl.months}>
        {months.map(({ m, left }, i) => (
          <span key={m.toISOString()} style={{ left: `${left}%` }}>
            {label(m, i)}
          </span>
        ))}
      </div>
      {time(today) >= from && time(today) <= to ? (
        <div className={tl.axis}>
          <span className={tl.today} style={{ left: `${pos(today)}%` }} title="Aujourd’hui" />
        </div>
      ) : null}
      {releases
        .filter(r => r.start || r.end)
        .map(r => (
          <div key={r.id} className={tl.track}>
            <span className={tl.trackLabel}>{r.name}</span>
            <span
              className={tl.releaseBar}
              data-status={r.status}
              style={bar(r)}
              title={`${r.name} · ${period(r)}`}
            />
          </div>
        ))}
      <div className={tl.track} style={{ height: 8 + rows * 20 }}>
        <span className={tl.trackLabel}>Sprints</span>
        {placed.map(({ item: s, row }) => (
          <Link
            key={s.id}
            to={`/realisation/sprint/${s.id}`}
            className={tl.sprintBar}
            data-status={s.status}
            style={{ ...bar(s), top: 5 + row * 20 }}
            title={`${s.name} · ${period(s)}`}
          >
            {s.name.replace(/^Sprint\s*/i, 'S')}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Feuille de route : versions (jalons de livraison), leur périmètre et leur avancement. */
export function Roadmap() {
  const { settings, releases, sprints, tickets } = useDelivery();
  const canEdit = useCanEdit();
  const sorted = [...releases].sort((a, b) => (a.end ?? '9').localeCompare(b.end ?? '9'));
  const releaseColumns = useReleaseColumns();
  const [planning, setPlanning] = useState<{ release: string; mode: PlanMode } | null>(null);
  const planned = planning && releases.find(r => r.id === planning.release);
  const openPlanner = (release: string, mode: PlanMode) => {
    setPlanning({ release, mode });
    requestAnimationFrame(() =>
      document.getElementById('planificateur')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  return (
    <DeliveryGate>
      <div className={`${page.page} ${page.wide}`}>
        <span className={page.icon} aria-hidden="true">
          🗺️
        </span>
        <h1 className={page.h1}>Feuille de route</h1>
        <p className={page.lead}>
          Les versions à livrer, avec leurs dates et leur avancement. Les US d’une version du cadrage (MVP,
          V1…) sont rangées par défaut dans la version qui la couvre.
        </p>
        <p className={page.actions}>
          {canEdit ? (
            <button type="button" className={page.primary} onClick={() => void delivery.createRelease()}>
              + Version
            </button>
          ) : null}
          <ExportButton name="versions" rows={sorted} columns={releaseColumns} noun="versions" />
        </p>
        <Timeline releases={sorted} sprints={[...sprints].sort(sprintOrder)} />
        {planning && planned ? (
          <div id="planificateur">
            <SprintPlanner
              key={`${planning.release}:${planning.mode}`}
              release={planned}
              mode={planning.mode}
              onClose={() => setPlanning(null)}
            />
          </div>
        ) : null}
        <div className={styles.cards}>
          {sorted.map(r => {
            const p = progress(
              settings,
              tickets.filter(t => t.release === r.id),
            );
            const pct = p.total
              ? Math.round((p.done / p.total) * 100)
              : p.count
                ? Math.round((p.doneCount / p.count) * 100)
                : 0;
            return (
              <div key={r.id} className={styles.card}>
                <span className={styles.cardHead}>
                  <EditableText
                    variant="inline"
                    multiline={false}
                    value={r.name}
                    label="Nom de la version"
                    onChange={name => delivery.updateRelease(r.id, { name })}
                  />
                  <select
                    className={styles.filter}
                    value={r.status}
                    disabled={!canEdit}
                    aria-label="Statut"
                    onChange={e => delivery.updateRelease(r.id, { status: e.target.value as ReleaseStatus })}
                  >
                    {RELEASE_STATUSES.map(s => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </span>
                <span className={styles.dates}>
                  <input
                    type="date"
                    value={r.start ?? ''}
                    disabled={!canEdit}
                    aria-label="Début"
                    onChange={e => delivery.updateRelease(r.id, { start: e.target.value || null })}
                  />
                  →
                  <input
                    type="date"
                    value={r.end ?? ''}
                    disabled={!canEdit}
                    aria-label="Livraison"
                    onChange={e => delivery.updateRelease(r.id, { end: e.target.value || null })}
                  />
                </span>
                <span className={styles.versions}>
                  Couvre :
                  {versionsOf(settings)
                    .filter(v => v !== OUT_OF_SCOPE)
                    .map(v => (
                      <label key={v} className={styles.inline}>
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={r.versions.includes(v)}
                          onChange={e =>
                            delivery.updateRelease(r.id, {
                              versions: e.target.checked
                                ? [...r.versions, v]
                                : r.versions.filter(x => x !== v),
                            })
                          }
                        />
                        <Tag value={v} />
                      </label>
                    ))}
                </span>
                <EditableText
                  variant="inline"
                  value={r.goal}
                  label="Objectif de la version"
                  placeholder="Objectif, contenu attendu"
                  onChange={goal => delivery.updateRelease(r.id, { goal })}
                />
                <span className={styles.bar} aria-label={`${pct} % terminé`}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <ReleaseSprints release={r} onPlan={mode => openPlanner(r.id, mode)} />
                <span className={page.faint}>
                  {p.doneCount}/{p.count} tickets terminés
                  {p.total ? ` · ${amount(p.done, settings)} sur ${amount(p.total, settings)}` : ''}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className={`${page.ghost} ${page.danger}`}
                    onClick={() =>
                      confirm(`Supprimer ${r.name} ? Ses tickets et sprints n’auront plus de version.`) &&
                      void delivery.deleteRelease(r.id)
                    }
                  >
                    Supprimer
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {!sorted.length ? (
          <p className={page.faint}>Aucune version pour le moment : créez le MVP, puis la V1…</p>
        ) : null}
      </div>
    </DeliveryGate>
  );
}
