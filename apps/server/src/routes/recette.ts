import { Hono } from 'hono';
import { z } from 'zod';
import {
  CAMPAIGN_STATUSES,
  hasVerdicts,
  withTicketDefaults,
  type Campaign,
  type Story,
  type Ticket,
} from '@board/shared';
import { requireDelivery } from '../access';
import { requireRole, type AppEnv } from '../auth';
import { fail } from '../log';
import {
  createEntity,
  getEntity,
  getSettings,
  deleteEntity,
  mutate,
  mutatePair,
  nextId,
  NotFound,
} from '../repo';
import { all, blankTicket, keyOf } from './delivery';
import { blocks } from './schemas';
import { body } from './workspace';

/**
 * Recette : campagnes par version. Les cas de test sont les critères d'acceptation des US du
 * périmètre. Résultats saisis par l'équipe (éditeurs), et par le client en mode « client » ;
 * verdict du client par US en modes « client » et « mixte ».
 */
export const recetteRoutes = new Hono<AppEnv>();

const editor = [requireRole('editor'), requireDelivery] as const;
const member = [requireRole('viewer'), requireDelivery] as const;

recetteRoutes.onError((err, c) => {
  if (err instanceof NotFound) return c.json({ error: 'not_found' }, 404);
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

const id = z.string().max(40);
const CampaignPatch = z
  .object({
    name: z.string().max(200),
    release: id,
    mode: z.enum(['internal', 'client', 'pv', 'mixed']),
    status: z.enum(CAMPAIGN_STATUSES),
    start: z.iso.date().nullable(),
    end: z.iso.date().nullable(),
    scope: z.array(id).max(2000),
    signatories: z.array(id).max(30),
    notes: blocks,
  })
  .partial()
  .strict();
const ResultBody = z.object({
  status: z.enum(['', 'ok', 'ko', 'reserve', 'na']),
  comment: z.string().max(4000).default(''),
});
const VerdictBody = z.object({
  status: z.enum(['', 'accepted', 'refused']),
  comment: z.string().max(4000).default(''),
});

type Ctx = { get: (k: 'project' | 'user' | 'role') => unknown };
const who = (c: Ctx) => ({
  project: (c.get('project') as { id: string; slug: string }).id,
  slug: (c.get('project') as { slug: string }).slug,
  user: c.get('user') as { id: string; name: string; email: string },
  role: c.get('role') as string,
});
const now = () => new Date().toISOString();

/** US d'une version : celles dont un ticket « US » y est rangé. */
async function storiesOfRelease(project: string, release: string) {
  const tickets = await all<Ticket>(project, 'ticket');
  return [...new Set(tickets.filter(t => t.release === release && t.story).map(t => t.story))];
}

recetteRoutes.post('/campaigns', ...editor, async c => {
  const input = await body(c.req, z.object({ patch: CampaignPatch.optional() }));
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const release = input.patch?.release ?? '';
  const scope = input.patch?.scope ?? (release ? await storiesOfRelease(project, release) : []);
  const campaign = await createEntity(
    project,
    user.id,
    'campaign',
    ids => nextId(ids, 'REC-'),
    (cid): Campaign => ({
      id: cid,
      name: `Recette ${Number(cid.slice(4))}`,
      release,
      mode: 'internal',
      status: 'En préparation',
      start: null,
      end: null,
      scope,
      results: {},
      verdicts: {},
      signatories: [],
      notes: [],
      ...input.patch,
    }),
  );
  return c.json(campaign, 201);
});

recetteRoutes.patch('/campaigns/:id', ...editor, async c => {
  const patch = await body(c.req, CampaignPatch);
  if (!patch) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  return c.json(
    await mutate(project, 'campaign', c.req.param('id'), user.id, 'update', x => ({ ...x, ...patch }), patch),
  );
});

/** Ajoute au périmètre les US de la version de la campagne qui n'y sont pas encore. */
recetteRoutes.post('/campaigns/:id/scope', ...editor, async c => {
  const { project, user } = who(c);
  const campaign = await getEntity(project, 'campaign', c.req.param('id'));
  if (!campaign) return c.json({ error: 'not_found' }, 404);
  const fromRelease = campaign.release ? await storiesOfRelease(project, campaign.release) : [];
  return c.json(
    await mutate(project, 'campaign', campaign.id, user.id, 'scope', x => ({
      ...x,
      scope: [...new Set([...x.scope, ...fromRelease])],
    })),
  );
});

recetteRoutes.delete('/campaigns/:id', ...editor, async c => {
  const { project, user } = who(c);
  await deleteEntity(project, user.id, 'campaign', c.req.param('id'));
  return c.json({ ok: true });
});

/** Résultat d'un cas de test (clé « US:critère ») : l'équipe, ou le client en mode « client ». */
recetteRoutes.put('/campaigns/:id/results/:key', ...member, async c => {
  const input = await body(c.req, ResultBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user, role } = who(c);
  const campaign = await getEntity(project, 'campaign', c.req.param('id'));
  if (!campaign) return c.json({ error: 'not_found' }, 404);
  if (role === 'viewer' && campaign.mode !== 'client') return c.json({ error: 'forbidden' }, 403);
  const key = c.req.param('key');
  if (!campaign.scope.includes(key.split(':')[0]))
    return c.json({ error: 'invalid', message: 'US hors périmètre.' }, 400);
  return c.json(
    await mutate(
      project,
      'campaign',
      campaign.id,
      user.id,
      'result',
      x => ({
        ...x,
        results: {
          ...x.results,
          [key]: { bug: x.results[key]?.bug ?? '', ...input, by: user.name || user.email, at: now() },
        },
      }),
      { key, ...input },
    ),
  );
});

/** Verdict du client sur une US (modes « client » et « mixte »). */
recetteRoutes.put('/campaigns/:id/verdicts/:story', ...member, async c => {
  const input = await body(c.req, VerdictBody);
  if (!input) return c.json({ error: 'invalid' }, 400);
  const { project, user } = who(c);
  const campaign = await getEntity(project, 'campaign', c.req.param('id'));
  if (!campaign) return c.json({ error: 'not_found' }, 404);
  if (!hasVerdicts(campaign.mode))
    return c.json({ error: 'invalid', message: 'Pas de verdict client dans ce mode.' }, 400);
  const story = c.req.param('story');
  if (!campaign.scope.includes(story))
    return c.json({ error: 'invalid', message: 'US hors périmètre.' }, 400);
  return c.json(
    await mutate(
      project,
      'campaign',
      campaign.id,
      user.id,
      'verdict',
      x => ({
        ...x,
        verdicts: { ...x.verdicts, [story]: { ...input, by: user.name || user.email, at: now() } },
      }),
      { story, ...input },
    ),
  );
});

/**
 * Bug ouvert depuis un cas KO ou en réserve : ticket de type « bug » (s'il existe), dans la version de
 * la campagne, relié à l'US du cadrage et au ticket de cette US. Le résultat garde sa clé.
 */
recetteRoutes.post('/campaigns/:id/results/:key/bug', ...editor, async c => {
  const { project, slug, user } = who(c);
  const campaign = await getEntity(project, 'campaign', c.req.param('id'));
  if (!campaign) return c.json({ error: 'not_found' }, 404);
  const key = c.req.param('key');
  const [storyId, criterionId] = key.split(':');
  const story = await getEntity(project, 'story', storyId);
  const criterion = (story as Story | null)?.acceptance.find(a => a.id === criterionId);
  if (!story || !criterion) return c.json({ error: 'not_found' }, 404);
  if (campaign.results[key]?.bug)
    return c.json({ error: 'invalid', message: 'Un bug est déjà ouvert pour ce cas.' }, 400);
  const settings = await getSettings(project);
  const tickets = (await all<Ticket>(project, 'ticket')).map(withTicketDefaults);
  const storyTicket = tickets.find(t => t.story === storyId);
  const comment = campaign.results[key]?.comment ?? '';
  const created = await createEntity(
    project,
    user.id,
    'ticket',
    ids => nextId(ids, `${keyOf(settings, slug)}-`, 1),
    tid => ({
      ...blankTicket(settings, tid, tickets.reduce((m, t) => Math.max(m, t.rank), 0) + 1),
      type:
        settings.delivery.ticketTypes.find(t => t.id === 'bug')?.id ?? settings.delivery.ticketTypes[0].id,
      title: `${campaign.name} · ${storyId} : ${criterion.text}`.slice(0, 500),
      story: storyId,
      release: campaign.release,
      description: [
        { id: 'c', type: 'p', text: `Critère : ${criterion.text}` },
        ...(comment ? [{ id: 'o', type: 'p' as const, text: `Constat : ${comment}` }] : []),
      ],
    }),
  );
  const [bug] = storyTicket
    ? await mutatePair(project, 'ticket', [created.id, storyTicket.id], user.id, 'link', (a, b) => [
        { ...a, links: [...(a.links ?? []), { ticket: b.id, type: 'relates' }] },
        {
          ...b,
          links: [...(b.links ?? []).filter(l => l.ticket !== a.id), { ticket: a.id, type: 'relates' }],
        },
      ])
    : [created];
  const updated = await mutate(project, 'campaign', campaign.id, user.id, 'bug', x => ({
    ...x,
    results: {
      ...x.results,
      // Un cas sans résultat est noté KO à l'ouverture du bug ; un résultat déjà saisi est conservé.
      [key]: x.results[key]
        ? { ...x.results[key], bug: bug.id }
        : { status: 'ko', comment, by: user.name || user.email, at: now(), bug: bug.id },
    },
  }));
  return c.json({ campaign: updated, bug }, 201);
});
