import { isDone, load, type ProjectSettings, type Sprint, type SprintDay, type Ticket } from '@board/shared';
import { pool } from './db';
import { getSettings } from './repo';

/**
 * Relevés du burndown : l'état du sprint en cours, une ligne par jour, réécrite à chaque
 * modification de ticket ou de sprint (sauf le relevé final, pris à la clôture).
 */
const today = () => new Date().toISOString().slice(0, 10);

const of = async <T>(projectId: string, kind: string) =>
  (
    await pool.query<{ data: T }>('SELECT data FROM entities WHERE project_id = $1 AND kind = $2', [
      projectId,
      kind,
    ])
  ).rows.map(r => r.data);

async function write(
  projectId: string,
  sprint: string,
  settings: ProjectSettings,
  tickets: Ticket[],
  final: boolean,
) {
  const done = tickets.filter(t => isDone(settings, t));
  await pool.query(
    `INSERT INTO sprint_days (project_id, sprint, day, total, done, count, done_count, final)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (project_id, sprint, day) DO UPDATE
       SET total = $4, done = $5, count = $6, done_count = $7, final = $8, at = now()
       WHERE NOT sprint_days.final`,
    [projectId, sprint, today(), load(tickets).total, load(done).total, tickets.length, done.length, final],
  );
}

/** Relevé du jour du sprint en cours (aucun s'il n'y en a pas). */
export async function recordDay(projectId: string) {
  const active = (await of<Sprint>(projectId, 'sprint')).find(s => s.status === 'active');
  if (!active) return;
  const tickets = (await of<Ticket>(projectId, 'ticket')).filter(t => t.sprint === active.id);
  await write(projectId, active.id, await getSettings(projectId), tickets, false);
}

/** Relevé final, pris à la clôture avant le report des tickets non terminés. */
export const closeDay = (projectId: string, sprint: string, settings: ProjectSettings, tickets: Ticket[]) =>
  write(projectId, sprint, settings, tickets, true);

/** Relevés d'un sprint, du plus ancien au plus récent. */
export async function sprintDays(projectId: string, sprint: string): Promise<SprintDay[]> {
  const { rows } = await pool.query<{
    day: string;
    total: string;
    done: string;
    count: number;
    done_count: number;
  }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, total, done, count, done_count
       FROM sprint_days WHERE project_id = $1 AND sprint = $2 ORDER BY day`,
    [projectId, sprint],
  );
  return rows.map(r => ({
    day: r.day,
    total: Number(r.total),
    done: Number(r.done),
    count: r.count,
    doneCount: r.done_count,
  }));
}

const pending = new Map<string, NodeJS.Timeout>();
/** Regroupe les modifications rapprochées (glisser-déposer, clôture) en un seul relevé. */
export function scheduleDay(projectId: string, log: (m: string) => void = () => {}) {
  clearTimeout(pending.get(projectId));
  pending.set(
    projectId,
    setTimeout(() => {
      pending.delete(projectId);
      recordDay(projectId).catch(err => log(`relevé du sprint impossible : ${(err as Error).message}`));
    }, 1500).unref(),
  );
}
