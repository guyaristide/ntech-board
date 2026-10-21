import { useState } from 'react';
import { Link } from 'react-router-dom';
import { nextStartFor, replannable, sprintPeriods, sprintsOf, type Release } from '@board/shared';
import { delivery, useDelivery } from '../../model/delivery';
import { useCanEdit } from '../../model/store';
import page from '../Page.module.css';
import { period, shortDay, SprintTag } from './parts';
import styles from './Delivery.module.css';
import plan from './SprintPlan.module.css';

export type PlanMode = 'create' | 'update';

/** Sprints d'une version, sur sa carte : liste, ajout d'un sprint, création et mise à jour en série. */
export function ReleaseSprints({ release, onPlan }: { release: Release; onPlan: (mode: PlanMode) => void }) {
  const { settings, sprints } = useDelivery();
  const canEdit = useCanEdit();
  const own = sprintsOf(release.id, sprints);
  const addOne = () => {
    const weeks = settings.delivery.sprintWeeks;
    const [p] = sprintPeriods(nextStartFor(release, sprints, weeks), weeks, { count: 1 });
    void delivery.createSprint({ release: release.id, ...p });
  };
  return (
    <div className={plan.block}>
      <span className={page.faint}>
        {own.length ? `${own.length} sprint${own.length > 1 ? 's' : ''}` : 'Aucun sprint pour le moment'}
      </span>
      {own.length ? (
        <ul className={plan.list}>
          {own.map(s => (
            <li key={s.id}>
              <Link to={`/realisation/sprint/${s.id}`}>{s.name}</Link>
              <span className={page.faint}>{period(s)}</span>
              {s.status !== 'planned' ? <SprintTag sprint={s} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <span className={plan.buttons}>
          <button type="button" className={page.ghost} onClick={addOne} title="Ajoute un sprint à la suite">
            + Sprint
          </button>
          <button type="button" className={page.ghost} onClick={() => onPlan('create')}>
            Planifier les sprints…
          </button>
          {replannable(release.id, sprints).length ? (
            <button type="button" className={page.ghost} onClick={() => onPlan('update')}>
              Mettre à jour les sprints…
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

const WEEKS = [1, 2, 3, 4];
const nextNumber = (ids: string[]) => Math.max(0, ...ids.map(id => Number(id.slice(3)) || 0)) + 1;

/** Panneau de planification d'une version : création d'un coup, ou mise à jour d'un coup. */
export function SprintPlanner({
  release,
  mode,
  onClose,
}: {
  release: Release;
  mode: PlanMode;
  onClose: () => void;
}) {
  const { settings, sprints } = useDelivery();
  const planned = replannable(release.id, sprints);
  const [weeks, setWeeks] = useState(settings.delivery.sprintWeeks);
  const [start, setStart] = useState(
    mode === 'create' ? nextStartFor(release, sprints, weeks) : (planned[0]?.start ?? release.start ?? ''),
  );
  const [byCount, setByCount] = useState(!release.end);
  const [until, setUntil] = useState(release.end ?? '');
  const [count, setCount] = useState(3);
  const [moveDates, setMoveDates] = useState(true);
  const [setCapacity, setSetCapacity] = useState(mode === 'create');
  const [capacity, setCapacityValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const periods = start
    ? mode === 'create'
      ? sprintPeriods(start, weeks, byCount ? { count } : { until })
      : moveDates
        ? sprintPeriods(start, weeks, { count: planned.length })
        : []
    : [];
  const first = nextNumber(sprints.map(s => s.id));
  const late = release.end && periods.some(p => p.end > release.end!);
  const cap = capacity.trim() === '' ? null : Math.max(0, Number(capacity.replace(',', '.')) || 0);
  const ready = mode === 'create' ? periods.length > 0 : (moveDates && periods.length > 0) || setCapacity;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'create')
        await delivery.planSprints(release.id, {
          start,
          weeks,
          until: byCount ? null : until,
          count: byCount ? count : null,
          capacity: cap,
        });
      else
        await delivery.replanSprints(release.id, {
          ...(moveDates ? { start, weeks } : {}),
          ...(setCapacity ? { capacity: cap } : {}),
        });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La planification a échoué.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.import} aria-label={`Sprints de ${release.name}`}>
      <header className={styles.laneHead}>
        <span className={styles.laneTitle}>
          {mode === 'create' ? 'Planifier les sprints' : 'Mettre à jour les sprints'} de {release.name}
        </span>
        <span className={page.faint}>{period(release)}</span>
      </header>
      {mode === 'update' ? (
        <p className={page.faint}>
          Les {planned.length} sprint{planned.length > 1 ? 's' : ''} pas encore commencé
          {planned.length > 1 ? 's' : ''} sont réenchaînés dans leur ordre ; leurs tickets les suivent. Le
          sprint en cours et les sprints clos gardent leurs dates.
        </p>
      ) : null}
      <div className={plan.form}>
        {mode === 'update' ? (
          <label className={styles.inline}>
            <input type="checkbox" checked={moveDates} onChange={e => setMoveDates(e.target.checked)} />
            Recaler les dates
          </label>
        ) : null}
        {mode === 'create' || moveDates ? (
          <>
            <label className={plan.field}>
              {mode === 'create' ? 'Premier sprint le' : 'À partir du'}
              <input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </label>
            <label className={plan.field}>
              Durée
              <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}>
                {WEEKS.map(w => (
                  <option key={w} value={w}>
                    {w} semaine{w > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {mode === 'create' ? (
          <span className={plan.field}>
            Jusqu’à
            <span className={plan.choice}>
              <label className={styles.inline}>
                <input type="radio" checked={!byCount} onChange={() => setByCount(false)} />
                <input
                  type="date"
                  value={until}
                  aria-label="Date de fin"
                  onChange={e => {
                    setUntil(e.target.value);
                    setByCount(false);
                  }}
                />
              </label>
              <label className={styles.inline}>
                <input type="radio" checked={byCount} onChange={() => setByCount(true)} />
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={count}
                  className={plan.count}
                  aria-label="Nombre de sprints"
                  onChange={e => {
                    setCount(Math.min(26, Math.max(1, Number(e.target.value) || 1)));
                    setByCount(true);
                  }}
                />
                sprints
              </label>
            </span>
          </span>
        ) : null}
        {mode === 'update' ? (
          <label className={styles.inline}>
            <input type="checkbox" checked={setCapacity} onChange={e => setSetCapacity(e.target.checked)} />
            Changer la capacité
          </label>
        ) : null}
        {setCapacity ? (
          <label className={plan.field}>
            Capacité par sprint
            <input
              inputMode="decimal"
              className={plan.count}
              value={capacity}
              placeholder="—"
              onChange={e => setCapacityValue(e.target.value)}
            />
          </label>
        ) : null}
      </div>

      {periods.length ? (
        <ol className={plan.preview}>
          {periods.map((p, i) => {
            const current = mode === 'update' ? planned[i] : null;
            return (
              <li key={p.start}>
                <strong>{current ? current.name : `Sprint ${first + i}`}</strong>
                {current && (current.start !== p.start || current.end !== p.end) ? (
                  <span className={plan.old}>{period(current)}</span>
                ) : null}
                <span>{period(p)}</span>
              </li>
            );
          })}
        </ol>
      ) : mode === 'create' ? (
        <p className={page.faint}>
          {!byCount && until && start > until
            ? 'Le premier sprint commence après la date de fin : reculez la date de fin, ou choisissez un nombre de sprints.'
            : 'Aucun sprint dans cette période : vérifiez les dates.'}
        </p>
      ) : null}
      {late ? (
        <p className={plan.warn}>
          Le dernier sprint finit après la livraison prévue ({shortDay(release.end)}).
        </p>
      ) : null}
      {error ? <p className={plan.warn}>{error}</p> : null}
      <p className={page.actions}>
        <button type="button" className={page.ghost} onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className={page.primary}
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {mode === 'create' ? `Créer ${periods.length} sprint${periods.length > 1 ? 's' : ''}` : 'Appliquer'}
        </button>
      </p>
    </section>
  );
}
