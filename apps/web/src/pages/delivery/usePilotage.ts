import { useEffect, useMemo, useState } from 'react';
import {
  burndown,
  flowMetrics,
  isDone,
  load,
  type ProjectSettings,
  type Sprint,
  type SprintDay,
  type StatusChange,
  type Ticket,
} from '@board/shared';
import { api } from '../../model/api';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Burndown d'un sprint : relevés du serveur, et le jour même recalculé à partir des tickets
 * affichés, pour que la courbe suive les changements sans attendre le prochain relevé.
 */
export function useBurndown(settings: ProjectSettings, sprint: Sprint | undefined, tickets: Ticket[]) {
  const [days, setDays] = useState<SprintDay[]>([]);
  const id = sprint?.id;
  useEffect(() => {
    setDays([]);
    if (!id) return;
    let live = true;
    api
      .get<SprintDay[]>(`/sprints/${id}/days`)
      .then(d => live && setDays(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return useMemo(() => {
    if (!sprint) return null;
    const own = tickets.filter(t => t.sprint === sprint.id);
    const done = own.filter(t => isDone(settings, t));
    const now: SprintDay = {
      day: today(),
      total: load(own).total,
      done: load(done).total,
      count: own.length,
      doneCount: done.length,
    };
    const merged = sprint.status === 'active' ? [...days.filter(d => d.day !== now.day), now] : days;
    return burndown(settings, sprint, merged);
  }, [settings, sprint, tickets, days]);
}

/**
 * Indicateurs de flux : l'historique des changements d'étape vient du serveur, relu peu après chaque
 * changement d'étape à l'écran ; les calculs suivent les tickets affichés.
 */
export function useFlow(settings: ProjectSettings, tickets: Ticket[]) {
  const [changes, setChanges] = useState<StatusChange[] | null>(null);
  const key = tickets.map(t => `${t.id}:${t.status}`).join('|');
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        api
          .get<StatusChange[]>('/flow/status-changes')
          .then(d => live && setChanges(d))
          .catch(() => {}),
      changes ? 1500 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(
    () => (changes ? flowMetrics(settings, tickets, changes) : null),
    [settings, tickets, changes],
  );
}
