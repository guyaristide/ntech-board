import { Hono } from 'hono';
import {
  epicKey,
  epicPrefix,
  newEpic,
  newSession,
  newWorkshop,
  nextCode,
  nextSessionCode,
  type AgendaItem,
  type Diligence,
  type Epic,
  type Story,
  type Workshop,
} from '@board/shared';
import { requireRole, type AppEnv } from '../auth';
import { fail } from '../log';
import { createEntity, deleteEntity, getEntity, mutate, mutateMany, NotFound } from '../repo';
import { all } from './delivery';
import {
  AgendaBody,
  EpicCreate,
  EpicPatch,
  ReferenceCreate,
  ReferencePatch,
  SessionCreate,
  SessionPatch,
  WorkshopCreate,
  WorkshopPatch,
} from './programmeSchemas';
import { body } from './workspace';

/**
 * Programme et épiques construits dans l'outil : un projet neuf s'organise sans fichier à importer.
 * Un atelier créé ou restructuré ici devient « géré dans l'outil » : un nouvel import du planning ne
 * le remplace plus (voir merge.ts).
 */
export const programmeRoutes = new Hono<AppEnv>();

const write = requireRole('editor');

class Taken extends Error {}

programmeRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  if (err instanceof Taken)
    return c.json({ error: 'taken', message: `L’identifiant ${err.message} est déjà pris.` }, 409);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

type Ctx = { get: (k: 'project' | 'user') => unknown };
const who = (c: Ctx) => ({
  project: (c.get('project') as { id: string }).id,
  user: (c.get('user') as { id: string }).id,
});

/** Identifiant demandé s'il est libre, sinon le suivant de la série. */
const pick = (wanted: string | undefined, fallback: (ids: string[]) => string) => (ids: string[]) => {
  if (wanted && ids.some(i => i.toLowerCase() === wanted.toLowerCase())) throw new Taken(wanted);
  return wanted || fallback(ids);
};

/** Ordre du jour cohérent : séquences connues une seule fois, séquences oubliées ajoutées à la fin. */
function normalizeAgenda(w: Workshop, agenda: AgendaItem[]): AgendaItem[] {
  const codes = new Set(w.sessions.map(s => s.code));
  const seen = new Set<string>();
  const kept = agenda.filter(it => {
    if (it.kind === 'break') return true;
    if (!codes.has(it.code) || seen.has(it.code)) return false;
    seen.add(it.code);
    return true;
  });
  return [
    ...kept,
    ...w.sessions.filter(s => !seen.has(s.code)).map(s => ({ kind: 'session' as const, code: s.code })),
  ];
}

// --- Ateliers ---------------------------------------------------------------------------

programmeRoutes.post('/workshops', write, async c => {
  const input = await body(c.req, WorkshopCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const w = await createEntity(
    project,
    user,
    'workshop',
    pick(input.id, ids => nextCode(ids, 'J')),
    id => newWorkshop(id, { title: 'Nouvel atelier', ...input.patch }),
  );
  return c.json(w, 201);
});

/** Notes et statut du PV ne changent pas la structure ; le reste rend l'atelier « géré dans l'outil ». */
programmeRoutes.patch('/workshops/:id', write, async c => {
  const patch = await body(c.req, WorkshopPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const structural = Object.keys(patch).some(k => k !== 'notes' && k !== 'pvStatus');
  return c.json(
    await mutate(
      project,
      'workshop',
      c.req.param('id'),
      user,
      'update',
      w => ({ ...w, ...patch, ...(structural ? { custom: true } : {}) }),
      patch,
    ),
  );
});

/** Supprime un atelier ; les US, épiques et diligences qui y renvoyaient n'y renvoient plus. */
programmeRoutes.delete('/workshops/:id', write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  if (!(await getEntity(project, 'workshop', id))) return c.json({ error: 'not_found' }, 404);
  const stories = (await all<Story>(project, 'story')).filter(s => s.workshop === id).map(s => s.id);
  const epics = (await all<Epic>(project, 'epic')).filter(e => e.workshops.includes(id)).map(e => e.id);
  const diligences = (await all<Diligence>(project, 'diligence'))
    .filter(d => d.workshops.includes(id))
    .map(d => d.id);
  await mutateMany(project, 'story', stories, user, 'update', s => ({ ...s, workshop: '' }), {
    workshop: '',
  });
  await mutateMany(project, 'epic', epics, user, 'update', e => ({
    ...e,
    workshops: e.workshops.filter(x => x !== id),
  }));
  await mutateMany(project, 'diligence', diligences, user, 'update', d => ({
    ...d,
    workshops: d.workshops.filter(x => x !== id),
  }));
  await deleteEntity(project, user, 'workshop', id);
  return c.json({ ok: true });
});

// --- Séquences et ordre du jour ----------------------------------------------------------

programmeRoutes.post('/workshops/:id/sessions', write, async c => {
  const input = await body(c.req, SessionCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(
    await mutate(project, 'workshop', c.req.param('id'), user, 'session-add', w => {
      const code = nextSessionCode(w);
      const sessions = [
        ...w.sessions,
        newSession(code, { title: 'Nouvelle séquence', atelier: w.title, ...input.patch }),
      ];
      return {
        ...w,
        custom: true,
        sessions,
        agenda: w.agenda.length ? [...w.agenda, { kind: 'session', code }] : [],
      };
    }),
    201,
  );
});

programmeRoutes.patch('/workshops/:id/sessions/:code', write, async c => {
  const patch = await body(c.req, SessionPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const code = c.req.param('code');
  const structural = Object.keys(patch).some(k => k !== 'notes');
  return c.json(
    await mutate(
      project,
      'workshop',
      c.req.param('id'),
      user,
      `session:${code}`,
      w => {
        if (!w.sessions.some(s => s.code === code)) throw new NotFound(`session ${code}`);
        return {
          ...w,
          ...(structural ? { custom: true } : {}),
          sessions: w.sessions.map(s => (s.code === code ? { ...s, ...patch } : s)),
        };
      },
      patch,
    ),
  );
});

/** Supprime une séquence, avec ses points à trancher et ses notes. */
programmeRoutes.delete('/workshops/:id/sessions/:code', write, async c => {
  const { project, user } = who(c);
  const code = c.req.param('code');
  return c.json(
    await mutate(project, 'workshop', c.req.param('id'), user, `session-delete:${code}`, w => {
      if (!w.sessions.some(s => s.code === code)) throw new NotFound(`session ${code}`);
      return {
        ...w,
        custom: true,
        sessions: w.sessions.filter(s => s.code !== code),
        agenda: w.agenda.filter(it => it.kind === 'break' || it.code !== code),
      };
    }),
  );
});

/** Ordre du jour : séquences et pauses, dans l'ordre voulu. */
programmeRoutes.put('/workshops/:id/agenda', write, async c => {
  const input = await body(c.req, AgendaBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(
    await mutate(project, 'workshop', c.req.param('id'), user, 'agenda', w => ({
      ...w,
      custom: true,
      agenda: normalizeAgenda(w, input.agenda),
    })),
  );
});

// --- Épiques ----------------------------------------------------------------------------

programmeRoutes.post('/epics', write, async c => {
  const input = await body(c.req, EpicCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const existing = await all<Epic>(project, 'epic');
  const prefix = epicPrefix(existing);
  const wanted = input.id?.toUpperCase();
  // EX01 et EX-01 donneraient les mêmes identifiants d'US : refusés comme un doublon.
  if (wanted && existing.some(x => epicKey(x.id) === epicKey(wanted))) throw new Taken(wanted);
  const e = await createEntity(
    project,
    user,
    'epic',
    pick(wanted, ids => nextCode(ids, prefix, 2)),
    id => newEpic(id, { title: 'Nouvelle épique', ...input.patch }),
  );
  return c.json(e, 201);
});

programmeRoutes.patch('/epics/:id', write, async c => {
  const patch = await body(c.req, EpicPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(
    await mutate(project, 'epic', c.req.param('id'), user, 'update', e => ({ ...e, ...patch }), patch),
  );
});

/** Une épique ne se supprime que vide : ses US doivent d'abord être déplacées ou supprimées. */
programmeRoutes.delete('/epics/:id', write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  const n = (await all<Story>(project, 'story')).filter(s => s.epic === id).length;
  if (n)
    return c.json(
      {
        error: 'not_empty',
        message: `L’épique contient encore ${n} US : déplacez-les ou supprimez-les d’abord.`,
      },
      409,
    );
  await deleteEntity(project, user, 'epic', id);
  return c.json({ ok: true });
});

// --- Références du cahier des charges ------------------------------------------------------

programmeRoutes.post('/references', write, async c => {
  const input = await body(c.req, ReferenceCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const r = await createEntity(
    project,
    user,
    'reference',
    ids => nextCode(ids, 'R', 2),
    id => ({
      id,
      subject: 'Nouvelle référence',
      says: [],
      where: '',
      gaps: '',
      sessions: [],
      ...input.patch,
    }),
  );
  return c.json(r, 201);
});

programmeRoutes.patch('/references/:id', write, async c => {
  const patch = await body(c.req, ReferencePatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(
    await mutate(project, 'reference', c.req.param('id'), user, 'update', r => ({ ...r, ...patch }), patch),
  );
});

/** Supprime une fiche ; les séquences qui la citaient ne la citent plus. */
programmeRoutes.delete('/references/:id', write, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  const citing = (await all<Workshop>(project, 'workshop'))
    .filter(w => w.sessions.some(s => s.refs.includes(id)))
    .map(w => w.id);
  await mutateMany(project, 'workshop', citing, user, 'update', w => ({
    ...w,
    sessions: w.sessions.map(s => ({ ...s, refs: s.refs.filter(r => r !== id) })),
  }));
  await deleteEntity(project, user, 'reference', id);
  return c.json({ ok: true });
});
