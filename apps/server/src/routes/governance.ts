import { Hono } from 'hono';
import {
  riskScopesOf,
  type Diligence,
  type Phase,
  type RaciRow,
  type Risk,
  type RiskAction,
} from '@board/shared';
import { requireRole, type AppEnv, type User } from '../auth';
import { fail } from '../log';
import { uid } from '../merge';
import { createEntity, deleteEntity, getEntity, getSettings, mutate, nextId, NotFound } from '../repo';
import { all } from './delivery';
import {
  CommentBody,
  DiligenceCreate,
  DiligencePatch,
  PhaseCreate,
  PhasePatch,
  RaciRowCreate,
  RaciRowPatch,
  RiskActionPatch,
  RiskCreate,
  RiskPatch,
  RiskReviewCreate,
} from './schemas';
import { body, comment } from './workspace';

/** Gouvernance du projet : phases et leur matrice RACI, risques, diligences issues des ateliers. */
export const governanceRoutes = new Hono<AppEnv>();

const write = requireRole('editor');

governanceRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});
const today = () => new Date().toISOString().slice(0, 10);

type Ctx = { get: (k: 'project' | 'user') => unknown };
const ids = (c: Ctx) => ({ project: (c.get('project') as { id: string }).id, user: c.get('user') as User });

// --- Phases -----------------------------------------------------------------------------

const onPhase = (c: Ctx, id: string, action: string, change: (p: Phase) => Phase, patch?: unknown) =>
  mutate(ids(c).project, 'phase', id, ids(c).user.id, action, change, patch);

const onRow = (p: Phase, rowId: string, change: (r: RaciRow) => RaciRow) => {
  if (!p.raci.some(r => r.id === rowId)) throw new NotFound(`ligne RACI ${rowId}`);
  return { ...p, raci: p.raci.map(r => (r.id === rowId ? change(r) : r)) };
};

governanceRoutes.post('/phases', write, async c => {
  const input = await body(c.req, PhaseCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  const source = input.copyFrom ? await getEntity(project, 'phase', input.copyFrom) : null;
  if (input.copyFrom && !source) return c.json({ error: 'not_found' }, 404);
  const phase = await createEntity(
    project,
    user.id,
    'phase',
    list => nextId(list, 'P', 1),
    id => ({
      id,
      title: input.title,
      summary: '',
      start: null,
      end: null,
      status: 'À venir',
      // Les lignes copiées gardent leur identifiant : on compare ainsi la phase à celle d'origine.
      actors: source?.actors ?? [],
      raci: source?.raci.map(r => ({ ...r, cells: { ...r.cells } })) ?? [],
      notes: [],
      comments: [],
    }),
  );
  return c.json(phase, 201);
});

governanceRoutes.patch('/phases/:id', write, async c => {
  const patch = await body(c.req, PhasePatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  return c.json(await onPhase(c, c.req.param('id'), 'update', p => ({ ...p, ...patch }), patch));
});

governanceRoutes.delete('/phases/:id', write, async c => {
  await deleteEntity(ids(c).project, ids(c).user.id, 'phase', c.req.param('id'));
  return c.json({ ok: true });
});

governanceRoutes.post('/phases/:id/raci', write, async c => {
  const input = await body(c.req, RaciRowCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const row: RaciRow = { id: uid(), activity: input.activity, deliverable: input.deliverable, cells: {} };
  return c.json(
    await onPhase(c, c.req.param('id'), 'raci-add', p => {
      const at = input.after ? p.raci.findIndex(r => r.id === input.after) : -1;
      return at < 0
        ? { ...p, raci: [...p.raci, row] }
        : { ...p, raci: [...p.raci.slice(0, at + 1), row, ...p.raci.slice(at + 1)] };
    }),
  );
});

governanceRoutes.patch('/phases/:id/raci/:row', write, async c => {
  const patch = await body(c.req, RaciRowPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const rowId = c.req.param('row');
  return c.json(
    await onPhase(
      c,
      c.req.param('id'),
      'raci',
      p =>
        onRow(p, rowId, r => ({
          ...r,
          ...patch,
          cells: Object.fromEntries(
            Object.entries({ ...r.cells, ...patch.cells }).filter(([, v]) => v !== ''),
          ) as RaciRow['cells'],
        })),
      { row: rowId, ...patch },
    ),
  );
});

governanceRoutes.delete('/phases/:id/raci/:row', write, async c => {
  const rowId = c.req.param('row');
  return c.json(
    await onPhase(c, c.req.param('id'), 'raci-delete', p => {
      if (!p.raci.some(r => r.id === rowId)) throw new NotFound(`ligne RACI ${rowId}`);
      return { ...p, raci: p.raci.filter(r => r.id !== rowId) };
    }),
  );
});

governanceRoutes.post('/phases/:id/comments', write, async c => {
  const input = await body(c.req, CommentBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const user = ids(c).user;
  return c.json(
    await onPhase(c, c.req.param('id'), 'comment', p => ({
      ...p,
      comments: [...p.comments, comment(user, input.text)],
    })),
  );
});

// --- Risques ----------------------------------------------------------------------------

const onRisk = (c: Ctx, id: string, action: string, change: (r: Risk) => Risk, patch?: unknown) =>
  mutate(ids(c).project, 'risk', id, ids(c).user.id, action, change, patch);

const onAction = (r: Risk, actionId: string, change: (a: RiskAction) => RiskAction) => {
  if (!r.actions.some(a => a.id === actionId)) throw new NotFound(`action ${actionId}`);
  return { ...r, actions: r.actions.map(a => (a.id === actionId ? change(a) : a)) };
};

governanceRoutes.post('/risks', write, async c => {
  const input = await body(c.req, RiskCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  const scopes = riskScopesOf(await getSettings(project), await all<Risk>(project, 'risk'));
  if (!scopes.some(s => s.prefix === input.prefix))
    return c.json({ error: 'invalid', message: 'Périmètre de risque inconnu.' }, 400);
  const risk = await createEntity(
    project,
    user.id,
    'risk',
    list => nextId(list, input.prefix),
    id => ({
      id,
      scope: scopes.find(s => s.prefix === input.prefix)?.name ?? input.prefix,
      category: '',
      title: '',
      cause: '',
      consequence: '',
      initial: { p: null, i: null },
      residual: { p: null, i: null },
      mitigation: '',
      contingency: '',
      owner: '',
      actionOwner: '',
      authority: '',
      due: '',
      indicator: '',
      status: 'Proposé',
      validation: 'À évaluer',
      source: `Saisi dans l’outil le ${today()}`,
      actions: [],
      reviews: [],
      notes: [],
      comments: [],
      ...input.patch,
    }),
  );
  return c.json(risk, 201);
});

governanceRoutes.patch('/risks/:id', write, async c => {
  const patch = await body(c.req, RiskPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  return c.json(await onRisk(c, c.req.param('id'), 'update', r => ({ ...r, ...patch }), patch));
});

governanceRoutes.delete('/risks/:id', write, async c => {
  await deleteEntity(ids(c).project, ids(c).user.id, 'risk', c.req.param('id'));
  return c.json({ ok: true });
});

/** Revue : fige la cotation et le statut actuels, datés et rattachés à une phase. */
governanceRoutes.post('/risks/:id/reviews', write, async c => {
  const input = await body(c.req, RiskReviewCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const user = ids(c).user;
  return c.json(
    await onRisk(c, c.req.param('id'), 'review', r => ({
      ...r,
      reviews: [
        ...r.reviews,
        {
          id: uid(),
          at: today(),
          phase: input.phase,
          initial: r.initial,
          residual: r.residual,
          status: r.status,
          comment: input.comment,
          author: user.name || user.email,
        },
      ],
    })),
  );
});

governanceRoutes.post('/risks/:id/actions', write, async c => {
  const input = await body(c.req, RiskActionPatch);
  if (!input) return c.json({ error: 'invalid' }, 400);
  return c.json(
    await onRisk(c, c.req.param('id'), 'action-add', r => ({
      ...r,
      actions: [
        ...r.actions,
        {
          id: uid(),
          text: '',
          nature: 'Préventive',
          owner: r.actionOwner || r.owner,
          due: '',
          status: 'À planifier',
          evidence: '',
          ...input,
        },
      ],
    })),
  );
});

governanceRoutes.patch('/risks/:id/actions/:action', write, async c => {
  const patch = await body(c.req, RiskActionPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const actionId = c.req.param('action');
  return c.json(
    await onRisk(c, c.req.param('id'), 'action', r => onAction(r, actionId, a => ({ ...a, ...patch })), {
      action: actionId,
      ...patch,
    }),
  );
});

governanceRoutes.delete('/risks/:id/actions/:action', write, async c => {
  const actionId = c.req.param('action');
  return c.json(
    await onRisk(c, c.req.param('id'), 'action-delete', r => {
      if (!r.actions.some(a => a.id === actionId)) throw new NotFound(`action ${actionId}`);
      return { ...r, actions: r.actions.filter(a => a.id !== actionId) };
    }),
  );
});

governanceRoutes.post('/risks/:id/comments', write, async c => {
  const input = await body(c.req, CommentBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const user = ids(c).user;
  return c.json(
    await onRisk(c, c.req.param('id'), 'comment', r => ({
      ...r,
      comments: [...r.comments, comment(user, input.text)],
    })),
  );
});

// --- Diligences -------------------------------------------------------------------------

const onDiligence = (
  c: Ctx,
  id: string,
  action: string,
  change: (d: Diligence) => Diligence,
  patch?: unknown,
) => mutate(ids(c).project, 'diligence', id, ids(c).user.id, action, change, patch);

governanceRoutes.post('/diligences', write, async c => {
  const input = await body(c.req, DiligenceCreate);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = ids(c);
  const diligence = await createEntity(
    project,
    user.id,
    'diligence',
    list => nextId(list, 'D'),
    id => ({
      id,
      title: '',
      detail: '',
      kind: 'Livrable',
      owner: '',
      partners: '',
      dependency: '',
      due: '',
      status: 'À faire',
      outcome: '',
      source: `Saisie dans l’outil le ${today()}`,
      workshops: [],
      stories: [],
      risks: [],
      notes: [],
      comments: [],
      ...input.patch,
    }),
  );
  return c.json(diligence, 201);
});

governanceRoutes.patch('/diligences/:id', write, async c => {
  const patch = await body(c.req, DiligencePatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  return c.json(await onDiligence(c, c.req.param('id'), 'update', d => ({ ...d, ...patch }), patch));
});

governanceRoutes.delete('/diligences/:id', write, async c => {
  await deleteEntity(ids(c).project, ids(c).user.id, 'diligence', c.req.param('id'));
  return c.json({ ok: true });
});

governanceRoutes.post('/diligences/:id/comments', write, async c => {
  const input = await body(c.req, CommentBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const user = ids(c).user;
  return c.json(
    await onDiligence(c, c.req.param('id'), 'comment', d => ({
      ...d,
      comments: [...d.comments, comment(user, input.text)],
    })),
  );
});
