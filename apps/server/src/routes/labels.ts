import { Hono } from 'hono';
import { TONES, canonicalLabels, fold, labelsOf, renameLabel, type Ticket } from '@board/shared';
import { z } from 'zod';
import { requireDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { getSettings, mutateMany, saveSettings } from '../repo';
import { all } from './delivery';
import { body } from './workspace';

/** Étiquettes des tickets, à l'échelle du projet : renommer ou fusionner, choisir la couleur. */
export const labelRoutes = new Hono<AppEnv>();

const write = [requireRole('editor'), requireDelivery] as const;
const name = z.string().trim().min(1).max(40);
const LabelRename = z.object({ from: name, to: name });
const LabelColor = z.object({ label: name, tone: z.enum(TONES).nullable() });

/** Renomme partout ; vers une étiquette existante, les deux n'en font plus qu'une. */
labelRoutes.post('/labels/rename', ...write, async c => {
  const input = await body(c.req, LabelRename);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const project = c.get('project').id;
  const user = c.get('user')!.id;
  const tickets = await all<Ticket>(project, 'ticket');
  const known = labelsOf(tickets);
  const from = known.find(l => fold(l) === fold(input.from));
  if (!from) return c.json({ error: 'not_found', message: 'Étiquette inconnue.' }, 404);
  // Sa propre écriture peut changer (« ia » devient « IA ») ; celle d'une autre étiquette est reprise.
  const [to] = canonicalLabels(
    [input.to],
    known.filter(l => l !== from),
  );
  const carrying = tickets.filter(t => (t.labels ?? []).includes(from)).map(t => t.id);
  const at = new Date().toISOString();
  const saved = await mutateMany(
    project,
    'ticket',
    carrying,
    user,
    'update',
    t => ({ ...t, labels: renameLabel(t.labels, from, to), updatedAt: at }),
    { renameLabel: { from, to } },
  );
  // La couleur suit le nouveau nom, sauf si l'étiquette rejointe a déjà la sienne.
  const current = await getSettings(project);
  const { [from]: tone, ...others } = current.delivery.labelColors;
  const labelColors = tone && !others[to] ? { ...others, [to]: tone } : others;
  const settings = tone
    ? await saveSettings(
        project,
        user,
        { ...current, delivery: { ...current.delivery, labelColors } },
        { renameLabel: { from, to } },
      )
    : current;
  return c.json({ to, tickets: saved, settings });
});

/** Choisit la couleur d'une étiquette ; `null` revient à la couleur automatique. */
labelRoutes.post('/labels/color', ...write, async c => {
  const input = await body(c.req, LabelColor);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const project = c.get('project').id;
  const label = labelsOf(await all<Ticket>(project, 'ticket')).find(l => fold(l) === fold(input.label));
  if (!label) return c.json({ error: 'not_found', message: 'Étiquette inconnue.' }, 404);
  const current = await getSettings(project);
  const { [label]: _previous, ...others } = current.delivery.labelColors;
  const labelColors = input.tone ? { ...others, [label]: input.tone } : others;
  return c.json(
    await saveSettings(
      project,
      c.get('user')!.id,
      { ...current, delivery: { ...current.delivery, labelColors } },
      { labelColor: { label, tone: input.tone } },
    ),
  );
});
