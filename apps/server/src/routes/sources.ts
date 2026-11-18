import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { applyProposal, nextCode, type Proposal, type Reference, type SourceItem } from '@board/shared';
import { AiUnavailable, extract } from '../ai/extract';
import { requireRole, type AppEnv } from '../auth';
import { env } from '../env';
import { fail, log } from '../log';
import {
  createEntity,
  createMany,
  deleteEntity,
  getEntity,
  getSettings,
  mutate,
  nextId,
  NotFound,
} from '../repo';
import { all } from './delivery';
import { body } from './workspace';

/**
 * Sources externes : dépôt d'un échange, analyse par l'IA en tâche de fond, relecture des
 * propositions. Réservé aux éditeurs ; une proposition acceptée écrit la Référence avec sa source.
 */
export const sourceRoutes = new Hono<AppEnv>();
type Ctx = Context<AppEnv>;
const editor = requireRole('editor');
const now = () => new Date().toISOString();
const who = (c: Ctx) => ({
  project: (c.get('project') as { id: string }).id,
  user: c.get('user') as { id: string; name: string; email: string },
});

/** Un échange d'une heure fait 60 000 à 100 000 caractères ; la limite laisse de la marge. */
const MAX_TEXT = 400_000;

const day = z.iso.date().nullable();
export const SourceCreate = z.object({
  title: z.string().trim().min(1).max(300),
  text: z.string().trim().min(20).max(MAX_TEXT),
  origin: z.enum(['paste', 'upload', 'mcp']).default('paste'),
  url: z.union([z.literal(''), z.url().max(2000)]).default(''),
  occurredAt: day.default(null),
  participants: z.string().max(1000).default(''),
});
const Fields = z
  .object({
    subject: z.string().max(300),
    says: z.array(z.string().max(4000)).max(100),
    where: z.string().max(500),
    gaps: z.string().max(4000),
  })
  .partial()
  .strict();
const Accept = z.object({ fields: Fields.optional(), target: z.string().max(40).optional() });
const Reject = z.object({ reason: z.string().max(1000).default('') });
const Bulk = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(200),
  reason: z.string().max(1000).default(''),
});

sourceRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

/** Projets dont une analyse tourne : une seule à la fois par échange. */
const running = new Set<string>();

/**
 * Analyse un échange et enregistre ses propositions. Tourne après la réponse HTTP : l'état de
 * l'échange (analyse en cours, analysé, en erreur) arrive aux navigateurs en temps réel.
 */
export async function analyze(projectId: string, userId: string, sourceId: string) {
  const key = `${projectId}:${sourceId}`;
  if (running.has(key)) return;
  running.add(key);
  const status = (patch: Partial<SourceItem>) =>
    mutate(projectId, 'source', sourceId, userId, 'update', s => ({ ...s, ...patch }), patch);
  try {
    const source = await status({ status: 'analyzing', error: '' });
    // Une nouvelle analyse remplace les propositions encore à relire de cet échange.
    const own = (await all<Proposal>(projectId, 'proposal')).filter(p => p.source === sourceId);
    for (const p of own.filter(p => p.status === 'pending'))
      await deleteEntity(projectId, userId, 'proposal', p.id);
    const references = await all<Reference>(projectId, 'reference');
    const found = await extract(await getSettings(projectId), references, source);
    // Ce qu'un éditeur a déjà tranché pour cet échange (même fiche, même citation) n'est pas reproposé.
    const decided = new Set(own.filter(p => p.status !== 'pending').map(p => `${p.target}|${p.quote}`));
    const drafts = found.drafts.filter(d => !decided.has(`${d.target}|${d.quote}`));
    const proposed = found.proposed;
    const at = now();
    await createMany(
      projectId,
      userId,
      'proposal',
      ids => nextId(ids, 'PRO-', 2),
      drafts.map(d => (id: string) => ({
        id,
        source: sourceId,
        ...d,
        status: 'pending' as const,
        decidedBy: '',
        decidedAt: null,
        reason: '',
        result: '',
        createdAt: at,
      })),
    );
    log('sources', `${sourceId} analysé : ${drafts.length} proposition(s) retenue(s) sur ${proposed}.`);
    await status({ status: 'done', error: '' });
  } catch (e) {
    const message =
      e instanceof AiUnavailable || e instanceof Error ? e.message : 'Analyse impossible, réessayez.';
    if (!(e instanceof AiUnavailable)) fail('sources', `analyse de ${sourceId}`, e);
    await status({ status: 'error', error: message }).catch(() => {});
  } finally {
    running.delete(key);
  }
}

sourceRoutes.post('/sources', editor, bodyLimit({ maxSize: 2 * 1024 * 1024 }), async c => {
  const input = await body(c.req, SourceCreate);
  if (!input)
    return c.json(
      {
        error: 'invalid',
        message:
          'Saisie invalide : titre, texte de 20 caractères au moins, date AAAA-MM-JJ, lien complet (https://…).',
      },
      400,
    );
  const { project, user } = who(c);
  const source = await createEntity(
    project,
    user.id,
    'source',
    ids => nextId(ids, 'SRC-', 2),
    id => ({
      id,
      ...input,
      status: 'pending',
      error: env.ai.key ? '' : 'Analyse indisponible : ANTHROPIC_API_KEY n’est pas configurée.',
      createdAt: now(),
      createdBy: user.name || user.email,
    }),
  );
  if (env.ai.key) void analyze(project, user.id, source.id);
  return c.json(source, 201);
});

sourceRoutes.post('/sources/:id/analyze', editor, async c => {
  const { project, user } = who(c);
  const source = await getEntity(project, 'source', c.req.param('id'));
  if (!source) return c.json({ error: 'not_found' }, 404);
  if (!env.ai.key)
    return c.json(
      { error: 'ai_unavailable', message: 'ANTHROPIC_API_KEY n’est pas configurée sur le serveur.' },
      503,
    );
  void analyze(project, user.id, source.id);
  return c.json({ ok: true }, 202);
});

/** Supprime un échange et ses propositions à relire ; les fiches déjà acceptées gardent leur citation. */
sourceRoutes.delete('/sources/:id', editor, async c => {
  const { project, user } = who(c);
  const id = c.req.param('id');
  const pending = (await all<Proposal>(project, 'proposal')).filter(
    p => p.source === id && p.status === 'pending',
  );
  for (const p of pending) await deleteEntity(project, user.id, 'proposal', p.id);
  await deleteEntity(project, user.id, 'source', id);
  return c.json({ ok: true });
});

/** Accepte une proposition : crée ou met à jour la Référence, avec l'échange dans ses sources. */
async function accept(c: Ctx, id: string, edit: z.infer<typeof Accept>) {
  const { project, user } = who(c);
  const proposal = await getEntity(project, 'proposal', id);
  if (!proposal) throw new NotFound();
  if (proposal.status !== 'pending') return { error: 'already_decided' as const };
  const fields = { ...proposal.fields, ...edit.fields };
  const target = edit.target ?? proposal.target;
  const at = now();
  let result: string;
  if (target) {
    const ref = await mutate(project, 'reference', target, user.id, 'update', r => ({
      ...r,
      ...applyProposal(r, { ...proposal, fields }, at),
    }));
    result = ref.id;
  } else {
    const ref = await createEntity(
      project,
      user.id,
      'reference',
      ids => nextCode(ids, 'R', 2),
      rid => ({ id: rid, ...applyProposal(null, { ...proposal, fields }, at) }),
    );
    result = ref.id;
  }
  await mutate(project, 'proposal', id, user.id, 'update', p => ({
    ...p,
    fields,
    target,
    status: 'accepted',
    decidedBy: user.name || user.email,
    decidedAt: at,
    result,
  }));
  return { result };
}

const reject = (c: Ctx, id: string, reason: string) => {
  const { project, user } = who(c);
  return mutate(project, 'proposal', id, user.id, 'update', p =>
    p.status !== 'pending'
      ? p
      : { ...p, status: 'rejected', decidedBy: user.name || user.email, decidedAt: now(), reason },
  );
};

sourceRoutes.post('/proposals/:id/accept', editor, async c => {
  const input = await body(c.req, Accept);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const out = await accept(c, c.req.param('id'), input);
  if ('error' in out) return c.json({ error: out.error, message: 'Proposition déjà traitée.' }, 409);
  return c.json(out);
});

sourceRoutes.post('/proposals/:id/reject', editor, async c => {
  const input = await body(c.req, Reject);
  if (!input) return c.json({ error: 'invalid' }, 400);
  return c.json(await reject(c, c.req.param('id'), input.reason));
});

/** Lots : chaque proposition est traitée à part ; celles déjà tranchées sont ignorées. */
sourceRoutes.post('/proposals/accept', editor, async c => {
  const input = await body(c.req, Bulk);
  if (!input) return c.json({ error: 'invalid' }, 400);
  let done = 0;
  for (const id of input.ids) {
    const out = await accept(c, id, {}).catch(e => (e instanceof NotFound ? null : Promise.reject(e)));
    if (out && !('error' in out)) done++;
  }
  return c.json({ done });
});

sourceRoutes.post('/proposals/reject', editor, async c => {
  const input = await body(c.req, Bulk);
  if (!input) return c.json({ error: 'invalid' }, 400);
  for (const id of input.ids)
    await reject(c, id, input.reason).catch(e => (e instanceof NotFound ? null : Promise.reject(e)));
  return c.json({ done: input.ids.length });
});
