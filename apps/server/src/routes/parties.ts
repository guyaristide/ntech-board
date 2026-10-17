import { Hono } from 'hono';
import { newParty, PARTY_PREFIX, type ProjectSettings } from '@board/shared';
import { requireRole, type AppEnv } from '../auth';
import { fail } from '../log';
import { createEntity, deleteEntity, getSettings, mutate, nextId, NotFound, saveSettings } from '../repo';
import { PartyCreate, PartyPatch, SettingsPatch } from './schemas';
import { body } from './workspace';

/** Référentiel des parties prenantes (éditeurs) et réglages du projet (administrateurs). */
export const partyRoutes = new Hono<AppEnv>();

const write = requireRole('editor');

partyRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

partyRoutes.post('/parties', write, async c => {
  const input = await body(c.req, PartyCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const party = await createEntity(
    c.get('project').id,
    c.get('user')!.id,
    'party',
    ids => nextId(ids, PARTY_PREFIX[input.type]),
    id => newParty(id, input.type, input.patch),
  );
  return c.json(party, 201);
});

partyRoutes.patch('/parties/:id', write, async c => {
  const patch = await body(c.req, PartyPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const party = await mutate(
    c.get('project').id,
    'party',
    c.req.param('id'),
    c.get('user')!.id,
    'update',
    p => ({ ...p, ...patch }),
    patch,
  );
  return c.json(party);
});

partyRoutes.delete('/parties/:id', write, async c => {
  await deleteEntity(c.get('project').id, c.get('user')!.id, 'party', c.req.param('id'));
  return c.json({ ok: true });
});

partyRoutes.patch('/settings', requireRole('admin'), async c => {
  const patch = await body(c.req, SettingsPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const p = c.get('project');
  const current = await getSettings(p.id);
  const next: ProjectSettings = {
    ...current,
    ...patch,
    delivery: { ...current.delivery, ...patch.delivery },
  };
  return c.json(await saveSettings(p.id, c.get('user')!.id, next, patch));
});
