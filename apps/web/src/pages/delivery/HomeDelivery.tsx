import { Link } from 'react-router-dom';
import {
  byCount,
  casesOf,
  forecast,
  isDone,
  partiesOfUser,
  releaseProgress,
  testSummary,
  workdaysLeft,
} from '@board/shared';
import { useDelivery } from '../../model/delivery';
import { useSeesDelivery, useWorkspace } from '../../model/store';
import page from '../Page.module.css';
import styles from '../Overview.module.css';
import { shortDay } from './parts';
import { Meter } from './Pilotage';

/** Accueil, partie Réalisation : sprint en cours, version visée, mes tickets, recette. */
export function HomeDelivery() {
  const sees = useSeesDelivery();
  const { settings, releases, sprints, tickets, campaigns } = useDelivery();
  const stories = useWorkspace(s => s.stories);
  const parties = useWorkspace(s => s.parties);
  const userId = useWorkspace(s => s.session?.user?.id ?? null);
  if (!sees || (!tickets.length && !sprints.length && !releases.length)) return null;
  const count = byCount(settings);
  const active = sprints.find(s => s.status === 'active');
  const own = active ? tickets.filter(t => t.sprint === active.id) : [];
  const est = (list: typeof tickets) =>
    count ? list.length : list.reduce((n, t) => n + (t.estimate ?? 0), 0);
  const current = releases.find(r => r.status === 'En cours') ?? releases.find(r => r.status === 'Prévue');
  const p = current ? releaseProgress(settings, current, tickets) : null;
  const f = current ? forecast(settings, current, tickets, sprints) : null;
  const me = partiesOfUser(parties, userId);
  const mine = tickets.filter(t => me.includes(t.assignee) && !isDone(settings, t));
  const testing = campaigns.filter(c => c.status === 'En cours');
  const tests = testSummary(testing.flatMap(c => casesOf(c, stories).map(x => x.result?.status ?? '')));
  return (
    <>
      <h2 className={page.h2}>
        Réalisation · <Link to="/realisation/pilotage">pilotage</Link>
      </h2>
      <div className={styles.cards}>
        {active ? (
          <Link to={`/realisation/sprint/${active.id}`} className={styles.card}>
            <span className={styles.cardCode}>Sprint en cours</span>
            <strong>{active.name}</strong>
            <Meter done={est(own.filter(t => isDone(settings, t)))} total={est(own)} />
            <span className={page.faint}>
              {workdaysLeft(active.end, undefined, active.start)} jours ouvrés restants
            </span>
          </Link>
        ) : null}
        {current && p && f ? (
          <Link to="/realisation/versions" className={styles.card}>
            <span className={styles.cardCode}>Version visée</span>
            <strong>{current.name}</strong>
            <Meter done={count ? p.doneCount : p.done} total={count ? p.count : p.total} />
            <span className={page.faint}>
              {current.end ? `Livraison ${shortDay(current.end)}` : 'Sans date'}
              {f.date ? `, prévue ${shortDay(f.date)}` : ''}
              {f.late ? ' (en retard)' : ''}
            </span>
          </Link>
        ) : null}
        {me.length ? (
          <Link to="/realisation/mes-tickets" className={styles.card}>
            <span className={styles.cardCode}>Mes tickets</span>
            <span className={styles.stat}>{mine.length}</span>
            <span className={page.faint}>non terminés</span>
          </Link>
        ) : null}
        {testing.length ? (
          <Link to="/realisation/recette" className={styles.card}>
            <span className={styles.cardCode}>Recette en cours</span>
            <span className={styles.stat}>{tests.todo}</span>
            <span className={page.faint}>
              cas à passer sur {tests.total}
              {tests.ko ? `, ${tests.ko} KO` : ''}
            </span>
          </Link>
        ) : null}
      </div>
    </>
  );
}
