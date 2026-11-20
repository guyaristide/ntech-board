import { parentStep, withTicketDefaults, type Ticket } from '@board/shared';
import { all, getSettings, mutate } from './repo';

/**
 * Règle des sous-tâches : quand l'étape d'une sous-tâche change, son ticket parent passe à l'étape de
 * sa sous-tâche la moins avancée. Une seule écriture (donc un seul événement) par parent, et
 * seulement si son étape change ; la règle remonte d'un niveau si le parent est lui-même une sous-tâche.
 */
export async function rollUpParents(projectId: string, userId: string, parentIds: Iterable<string>) {
  let pending = [...new Set(parentIds)].filter(Boolean);
  if (!pending.length) return;
  const settings = await getSettings(projectId);
  const seen = new Set<string>();
  while (pending.length) {
    const tickets = (await all<Ticket>(projectId, 'ticket')).map(withTicketDefaults);
    const next: string[] = [];
    for (const id of pending) {
      if (seen.has(id)) continue;
      seen.add(id);
      const parent = tickets.find(t => t.id === id);
      const step =
        parent &&
        parentStep(
          settings,
          tickets.filter(t => t.parent === id),
        );
      if (!parent || !step || step === parent.status) continue;
      const at = new Date().toISOString();
      await mutate(projectId, 'ticket', id, userId, 'update', t => ({ ...t, status: step, updatedAt: at }), {
        status: step,
      });
      if (parent.parent) next.push(parent.parent);
    }
    pending = next;
  }
}
