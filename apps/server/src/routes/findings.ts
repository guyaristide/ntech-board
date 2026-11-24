import { Hono } from 'hono';
import { z } from 'zod';
import {
  FINDING_LINK_KINDS,
  FINDING_NATURES,
  FINDING_SEVERITIES,
  isDone,
  withTicketDefaults,
  type Finding,
  type Story,
  type Ticket,
} from '@board/shared';
import { requireDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { moveFinding, retestFinding } from '../findings';
import { fail } from '../log';
import { autoFollow } from '../notifications';
import { all, createEntity, deleteEntity, getEntity, getSettings, mutate, nextId, NotFound } from '../repo';
import { blankTicket, keyOf } from './delivery';
import { body } from './workspace';

/**
 * Retours de recette. Tout membre qui voit la Réalisation peut en déposer un (le client aussi, dans
 * une campagne qui lui est ouverte) et retester les siens ; la qualification (gravité, ticket, rejet)
 * revient à l'équipe.
 */
export const findingRoutes = new Hono<AppEnv>();

const editor = [requireRole('editor'), requireDelivery] as const;
const member = [requireRole('viewer'), requireDelivery] as const;

findingRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

const text = z.string().max(6000);
const Content = z.object({
  title: z.string().trim().min(1).max(300),
  nature: z.enum(FINDING_NATURES),
  severity: z.enum(FINDING_SEVERITIES),
  steps: text,
  expected: text,
  actual: text,
  environment: z.string().max(500),
  story: z.string().max(40),
  related: z.array(z.object({ kind: z.enum(FINDING_LINK_KINDS), id: z.string().min(1).max(40) })).max(30),
});
const Create = Content.partial()
  .required({ title: true })
  .extend({ campaign: z.string().max(40), caseKey: z.string().max(90).default('') });

type Ctx = { get: (k: 'project' | 'user' | 'role') => unknown };
const who = (c: Ctx) => {
  const user = c.get('user') as { id: string; name: string; email: string };
  return {
    project: (c.get('project') as { id: string }).id,
    slug: (c.get('project') as { slug: string }).slug,
    user,
    actor: { id: user.id, name: user.name || user.email },
    role: c.get('role') as string,
  };
};
const now = () => new Date().toISOString();

findingRoutes.post('/findings', ...member, async c => {
  const input = await body(c.req, Create);
  if (!input) return c.json({ error: 'invalid', message: 'Un retour a au moins un titre.' }, 400);
  const { project, actor, role } = who(c);
  const campaign = await getEntity(project, 'campaign', input.campaign);
  if (!campaign) return c.json({ error: 'not_found' }, 404);
  // Un lecteur (le client) ne dépose des retours que dans une campagne qui lui est ouverte.
  if (role === 'viewer' && campaign.mode !== 'client' && campaign.mode !== 'mixed')
    return c.json({ error: 'forbidden' }, 403);
  const [storyId, criterionId] = input.caseKey.split(':');
  const story = input.caseKey ? ((await getEntity(project, 'story', storyId)) as Story | null) : null;
  const criterion = story?.acceptance.find(a => a.id === criterionId);
  if (input.caseKey && !criterion) return c.json({ error: 'invalid', message: 'Cas de test inconnu.' }, 400);
  const result = campaign.results[input.caseKey];
  const finding = await createEntity(
    project,
    actor.id,
    'finding',
    ids => nextId(ids, 'RET-', 2),
    (id): Finding => ({
      id,
      campaign: campaign.id,
      caseKey: input.caseKey,
      story: input.story ?? (criterion ? storyId : ''),
      title: input.title,
      nature: input.nature ?? 'bug',
      severity: input.severity ?? 'major',
      status: 'new',
      steps: input.steps ?? '',
      expected: input.expected ?? (criterion ? criterion.text : ''),
      actual: input.actual ?? result?.comment ?? '',
      environment: input.environment ?? '',
      ticket: '',
      related: input.related ?? [],
      reason: '',
      reporter: actor.id,
      reporterName: actor.name,
      createdAt: now(),
      updatedAt: now(),
      history: [{ at: now(), by: actor.name, from: '', to: 'new', note: '' }],
    }),
  );
  await autoFollow(project, [actor.id], 'finding', finding.id, 'author');
  // Un retour sur un cas pas encore noté le marque KO : le bilan de la campagne reste juste.
  if (input.caseKey && !result?.status)
    await mutate(project, 'campaign', campaign.id, actor.id, 'result', x => ({
      ...x,
      results: {
        ...x.results,
        [input.caseKey]: {
          bug: x.results[input.caseKey]?.bug ?? '',
          comment: x.results[input.caseKey]?.comment ?? '',
          status: 'ko',
          by: actor.name,
          at: now(),
        },
      },
    }));
  return c.json(finding, 201);
});

/** Contenu d'un retour : son auteur tant qu'il n'est pas qualifié, l'équipe ensuite. */
findingRoutes.patch('/findings/:id', ...member, async c => {
  const patch = await body(c.req, Content.partial().strict());
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, actor, role } = who(c);
  const f = await getEntity(project, 'finding', c.req.param('id'));
  if (!f) return c.json({ error: 'not_found' }, 404);
  if (role === 'viewer' && (f.reporter !== actor.id || f.status !== 'new' || patch.severity))
    return c.json({ error: 'forbidden' }, 403);
  return c.json(
    await mutate(
      project,
      'finding',
      f.id,
      actor.id,
      'update',
      x => ({ ...x, ...patch, updatedAt: now() }),
      patch,
    ),
  );
});

/**
 * Qualification par l'équipe : `accept` met le retour en correction (avec un ticket créé, un ticket
 * existant, ou sans ticket), `reject` l'écarte avec un motif, `reopen` le rouvre, `close` le clôt.
 */
const Decision = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    ticket: z.string().max(40).optional(),
    create: z.boolean().default(false),
  }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal('reopen'), note: z.string().max(500).default('') }),
  z.object({ action: z.literal('close'), note: z.string().max(500).default('') }),
]);

findingRoutes.post('/findings/:id/decision', ...editor, async c => {
  const input = await body(c.req, Decision);
  if (!input)
    return c.json({ error: 'invalid', message: 'Décision incomplète : un rejet demande un motif.' }, 400);
  const { project, slug, actor } = who(c);
  const f = await getEntity(project, 'finding', c.req.param('id'));
  if (!f) return c.json({ error: 'not_found' }, 404);
  if (input.action === 'reject')
    return c.json(
      await moveFinding(project, f.id, actor, 'rejected', input.reason, { reason: input.reason }),
    );
  if (input.action === 'reopen')
    return c.json(
      await moveFinding(project, f.id, actor, f.ticket ? 'open' : 'new', input.note, { reason: '' }),
    );
  if (input.action === 'close') return c.json(await moveFinding(project, f.id, actor, 'closed', input.note));

  const settings = await getSettings(project);
  const tickets = (await all<Ticket>(project, 'ticket')).map(withTicketDefaults);
  let ticket = input.ticket
    ? tickets.find(t => t.id.toLowerCase() === input.ticket!.toLowerCase())
    : tickets.find(t => t.id === f.ticket);
  if (input.ticket && !ticket)
    return c.json({ error: 'invalid', message: `Ticket ${input.ticket} introuvable.` }, 400);
  if (input.create && !ticket) {
    const campaign = await getEntity(project, 'campaign', f.campaign);
    const p = (id: string, label: string, value: string) =>
      value.trim() ? [{ id, type: 'p' as const, text: `${label} : ${value.trim()}` }] : [];
    const wanted = f.nature === 'bug' ? 'bug' : 'task';
    ticket = await createEntity(
      project,
      actor.id,
      'ticket',
      ids => nextId(ids, `${keyOf(settings, slug)}-`, 1),
      tid => ({
        ...blankTicket(settings, tid, tickets.reduce((m, t) => Math.max(m, t.rank), 0) + 1),
        type:
          settings.delivery.ticketTypes.find(t => t.id === wanted)?.id ?? settings.delivery.ticketTypes[0].id,
        title: f.title.slice(0, 500),
        story: f.story,
        release: campaign?.release ?? '',
        description: [
          {
            id: 'r',
            type: 'p',
            text: `Retour de recette ${f.id} (${campaign?.name ?? f.campaign}), signalé par ${f.reporterName}.`,
          },
          ...p('s', 'Pour reproduire', f.steps),
          ...p('e', 'Attendu', f.expected),
          ...p('a', 'Constaté', f.actual),
          ...p('v', 'Environnement', f.environment),
        ],
      }),
    );
  }
  // Ticket déjà terminé : la correction est là, il reste à la vérifier.
  const to = ticket && isDone(settings, ticket) ? 'retest' : 'open';
  return c.json({
    finding: await moveFinding(project, f.id, actor, to, ticket ? `Ticket ${ticket.id}` : 'Sans ticket', {
      ticket: ticket?.id ?? '',
      reason: '',
    }),
    ticket: ticket ?? null,
  });
});

/** Résultat d'un retest : par l'auteur du retour ou par l'équipe. */
findingRoutes.post('/findings/:id/retest', ...member, async c => {
  const input = await body(c.req, z.object({ fixed: z.boolean(), note: z.string().max(1000).default('') }));
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, actor, role } = who(c);
  const f = await getEntity(project, 'finding', c.req.param('id'));
  if (!f) return c.json({ error: 'not_found' }, 404);
  if (role === 'viewer' && f.reporter !== actor.id) return c.json({ error: 'forbidden' }, 403);
  if (f.status !== 'retest')
    return c.json({ error: 'invalid', message: 'Ce retour n’est pas à retester.' }, 400);
  return c.json(await retestFinding(project, f, actor, input.fixed, input.note));
});

findingRoutes.delete('/findings/:id', ...editor, async c => {
  const { project, actor } = who(c);
  await deleteEntity(project, actor.id, 'finding', c.req.param('id'));
  return c.json({ ok: true });
});
