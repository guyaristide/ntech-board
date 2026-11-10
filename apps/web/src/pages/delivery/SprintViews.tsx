import { useState, type MouseEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { byRank, stepOf, STEP_CATEGORY_LABEL, type Sprint, type Ticket } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import page from '../Page.module.css';
import { Column } from './Board';
import { day } from './exports';
import { TicketRow } from './parts';
import styles from './Delivery.module.css';
import k from './Tickets.module.css';
import tl from './SprintTimeline.module.css';

export type SprintView = 'liste' | 'kanban' | 'timeline';
export const SPRINT_VIEWS: [SprintView, string][] = [
  ['liste', '☰ Liste'],
  ['kanban', '▥ Kanban'],
  ['timeline', '▤ Timeline'],
];

/** Liste : les tickets par catégorie d'étape (à faire, en cours, terminé), puis les reportés. */
export function SprintList({ tickets, carried }: { tickets: Ticket[]; carried: Ticket[] }) {
  const { settings } = useDelivery();
  return (
    <>
      {(['todo', 'doing', 'done'] as const).map(cat => {
        const list = tickets.filter(
          t =>
            settings.delivery.workflow.find(s => s.id === t.status)?.category === cat ||
            (cat === 'todo' && !settings.delivery.workflow.some(s => s.id === t.status)),
        );
        return (
          <section key={cat}>
            <h2 className={page.h2}>
              {STEP_CATEGORY_LABEL[cat]} ({list.length})
            </h2>
            <div className={styles.rows}>
              {list.map(t => (
                <TicketRow key={t.id} ticket={t} />
              ))}
            </div>
          </section>
        );
      })}
      {carried.length ? (
        <section>
          <h2 className={page.h2}>Reportés à la clôture ({carried.length})</h2>
          <div className={styles.rows}>
            {carried.map(t => (
              <TicketRow key={t.id} ticket={t} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Kanban : une colonne par étape, comme le tableau du sprint ; glisser une carte change son étape. */
export function SprintKanban({ tickets }: { tickets: Ticket[] }) {
  const { settings } = useDelivery();
  return (
    <div className={k.board} style={{ marginTop: 12 }}>
      {settings.delivery.workflow.map(step => (
        <Column
          key={step.id}
          step={step}
          tickets={tickets.filter(t => stepOf(settings, t.status)?.id === step.id)}
        />
      ))}
    </div>
  );
}

const MS = 86_400_000;
const toDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / MS);
const fromDay = (n: number) => new Date(n * MS).toISOString().slice(0, 10);
const WEEKDAY = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

type Drag = { id: string; mode: 'move' | 'start' | 'due'; x: number; width: number; delta: number };

/** Jours couverts par un ticket : une seule date le place sur ce jour. */
const spanOf = (t: Ticket) => {
  const s = toDay((t.start ?? t.due)!);
  return [s, t.due ? toDay(t.due) : s] as const;
};

/**
 * Timeline : chaque ticket daté est une barre de son début à son échéance, sur les jours du sprint.
 * On déplace une barre en la glissant, on change une date en tirant un bord ; un clic sur la ligne
 * d'un ticket sans dates le place sur ce jour.
 */
export function SprintTimeline({ sprint, tickets }: { sprint: Sprint; tickets: Ticket[] }) {
  const { settings } = useDelivery();
  const canEdit = useCanEdit();
  const [drag, setDrag] = useState<Drag | null>(null);
  const today = toDay(new Date().toISOString().slice(0, 10));
  const dated = tickets
    .filter(t => t.start || t.due)
    .sort((a, b) => spanOf(a)[0] - spanOf(b)[0] || byRank(a, b));
  const undated = tickets.filter(t => !t.start && !t.due).sort(byRank);
  const points = [sprint.start, sprint.end, ...dated.flatMap(t => [t.start, t.due])]
    .filter((d): d is string => !!d)
    .map(toDay);
  const from = points.length ? Math.min(...points) : today;
  const to = Math.max(points.length ? Math.max(...points) : today, from + 13);
  const days = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const n = days.length;
  const inSprint = (d: number) =>
    (!sprint.start || d >= toDay(sprint.start)) && (!sprint.end || d <= toDay(sprint.end));

  const spanNow = (t: Ticket) => {
    const [s, e] = spanOf(t);
    if (drag?.id !== t.id) return [s, e];
    const d = drag.delta;
    if (drag.mode === 'move') return [s + d, e + d];
    return drag.mode === 'start' ? [Math.min(s + d, e), e] : [s, Math.max(e + d, s)];
  };
  const grab = (e: PointerEvent, t: Ticket, mode: Drag['mode']) => {
    if (!canEdit || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const track = (e.currentTarget as HTMLElement).closest(`.${tl.track}`) as HTMLElement;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: t.id, mode, x: e.clientX, width: track.getBoundingClientRect().width / n, delta: 0 });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const delta = Math.round((e.clientX - drag.x) / drag.width);
    if (delta !== drag.delta) setDrag({ ...drag, delta });
  };
  const drop = () => {
    if (!drag) return;
    const t = tickets.find(x => x.id === drag.id);
    if (t && drag.delta) {
      const [s, e] = spanNow(t);
      void delivery.updateTicket(t.id, { start: fromDay(s), due: fromDay(e) });
    }
    setDrag(null);
  };
  const place = (e: MouseEvent, t: Ticket) => {
    if (!canEdit) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const d = fromDay(from + Math.floor(((e.clientX - box.left) / box.width) * n));
    void delivery.updateTicket(t.id, { start: d, due: d });
  };
  const pct = (x: number) => `${(x / n) * 100}%`;
  const category = (t: Ticket) => stepOf(settings, t.status)?.category ?? 'todo';

  const row = (t: Ticket) => {
    const [s, e] = t.start || t.due ? spanNow(t) : [0, -1];
    return (
      <div key={t.id} className={tl.row}>
        <span className={tl.label}>
          <span className={styles.key}>{t.id}</span>
          <Link to={`/realisation/ticket/${t.id}`}>{t.title || 'Sans titre'}</Link>
        </span>
        <div
          className={tl.track}
          data-empty={e < s || undefined}
          data-editable={(canEdit && e < s) || undefined}
          title={e < s && canEdit ? 'Cliquez sur un jour pour dater ce ticket' : undefined}
          onClick={e < s ? ev => place(ev, t) : undefined}
        >
          {e >= s ? (
            <div
              className={tl.bar}
              data-category={category(t)}
              data-dragging={drag?.id === t.id || undefined}
              data-short={e - s < 2 ? (e - from > n - 5 ? 'left' : 'right') : undefined}
              style={{ left: pct(s - from), width: pct(e - s + 1) }}
              title={`${t.id} · ${stepOf(settings, t.status)?.name ?? t.status} · ${day(fromDay(s))} → ${day(fromDay(e))}`}
              onPointerDown={ev => grab(ev, t, 'move')}
            >
              {canEdit ? (
                <span className={tl.handle} data-side="start" onPointerDown={ev => grab(ev, t, 'start')} />
              ) : null}
              <span className={tl.barText}>{t.title || t.id}</span>
              {canEdit ? (
                <span className={tl.handle} data-side="due" onPointerDown={ev => grab(ev, t, 'due')} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className={tl.scroller}>
      <div
        className={tl.grid}
        style={{ ['--days' as string]: n }}
        onPointerMove={move}
        onPointerUp={drop}
        onPointerCancel={() => setDrag(null)}
      >
        <div className={tl.row} data-head>
          <span className={tl.label}>
            {dated.length} daté{dated.length > 1 ? 's' : ''} sur {tickets.length}
          </span>
          <div className={tl.scale}>
            {days.map(d => {
              const date = new Date(d * MS);
              return (
                <span
                  key={d}
                  className={tl.day}
                  data-off={!inSprint(d) || undefined}
                  data-weekend={date.getUTCDay() % 6 === 0 || undefined}
                  data-today={d === today || undefined}
                  title={day(fromDay(d))}
                >
                  {date.getUTCDate() === 1 || d === from
                    ? date.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })
                    : WEEKDAY[date.getUTCDay()]}
                  <strong>{date.getUTCDate()}</strong>
                </span>
              );
            })}
          </div>
        </div>
        <div className={tl.body}>
          <div className={tl.columns} aria-hidden="true">
            {days.map(d => (
              <span
                key={d}
                data-off={!inSprint(d) || undefined}
                data-weekend={new Date(d * MS).getUTCDay() % 6 === 0 || undefined}
              />
            ))}
            {today >= from && today <= to ? (
              <div className={tl.today} style={{ left: pct(today - from + 0.5) }} />
            ) : null}
          </div>
          {dated.map(row)}
          {undated.length ? (
            <>
              <p className={tl.group}>
                Sans dates ({undated.length})
                {canEdit ? ' · cliquez sur un jour de la ligne pour placer le ticket' : ''}
              </p>
              {undated.map(row)}
            </>
          ) : null}
          {!tickets.length ? <p className={tl.group}>Aucun ticket.</p> : null}
        </div>
      </div>
    </div>
  );
}
