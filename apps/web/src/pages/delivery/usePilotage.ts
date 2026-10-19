import { useEffect, useMemo, useState } from 'react';
import {
  burndown,
  isDone,
  load,
  type ProjectSettings,
  type Sprint,
  type SprintDay,
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
