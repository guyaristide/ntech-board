import { Hono } from 'hono';
import { z } from 'zod';
import { parseSlackCommand, SLACK_EVENT_GROUPS, type SlackLinkRequest } from '@board/shared';
import { internalHeaders, originOf, requireRole, type AppEnv } from '../auth';
import { canEncrypt } from '../files/crypto';
import { fail, log } from '../log';
import { HELP, runSlackCommand, type Api } from '../slack/commands';
import { postToSlack } from '../slack/outbound';
import { validSlackSignature } from '../slack/signature';
import {
  confirmLink,
  linkedUser,
  linkRequest,
  newLinkToken,
  saveSlack,
  signingSecret,
  slackStatus,
  slackTarget,
  unlink,
  WEBHOOK_PATTERN,
} from '../slack/store';

const MESSAGES: Record<string, string> = {
  forbidden: 'Votre rôle dans le projet ne permet pas cette action.',
  delivery_hidden: 'La partie Réalisation n’est pas ouverte à votre profil.',
  not_found: 'Élément introuvable.',
  invalid: 'Valeurs refusées par le tableau.',
  unauthenticated: 'Votre compte n’est plus membre de ce projet.',
};

export function slackRoutes(fetchApi: (req: Request) => Promise<Response>) {
  const routes = new Hono<AppEnv>();
  const admin = requireRole('admin');

  // Réglages (administrateurs)

  routes.get('/slack', admin, async c => c.json(await slackStatus(c.get('project').id, originOf(c))));

  routes.put('/slack', admin, async c => {
    const input = z
      .object({
        webhook: z.union([z.literal(''), z.string().trim().regex(WEBHOOK_PATTERN)]).optional(),
        signingSecret: z
          .union([
            z.literal(''),
            z
              .string()
              .trim()
              .regex(/^[a-f0-9]{20,64}$/i),
          ])
          .optional(),
        events: z.array(z.enum(SLACK_EVENT_GROUPS)).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        {
          error: 'invalid',
          message:
            'Saisie refusée : le webhook commence par « https://hooks.slack.com/services/ » ; le secret de signature est une suite de 32 caractères (chiffres et lettres de a à f).',
        },
        400,
      );
    const project = c.get('project');
    const user = c.get('user')!;
    if ((input.data.webhook || input.data.signingSecret) && !canEncrypt())
      return c.json(
        {
          error: 'secrets_key_missing',
          message: 'Le serveur n’a pas de clé SECRETS_KEY : impossible d’enregistrer ce secret.',
        },
        400,
      );
    // Un webhook est essayé avant d'être gardé : le canal reçoit un message de bienvenue.
    if (input.data.webhook) {
      const sent = await postToSlack(
        input.data.webhook,
        `*${project.title}* est relié à ce canal : NTECH Board y publiera l’activité du projet.`,
      );
      if (!sent.ok) return c.json({ error: 'rejected', message: `Webhook refusé. ${sent.error}` }, 400);
    }
    await saveSlack(project.id, input.data, user.name || user.email);
    log(
      'slack',
      `${user.email} règle Slack pour « ${project.slug} » (${Object.keys(input.data).join(', ')}).`,
    );
    return c.json(await slackStatus(project.id, originOf(c)));
  });

  routes.post('/slack/test', admin, async c => {
    const project = c.get('project');
    const target = await slackTarget(project.id);
    if (!target) return c.json({ ok: false, message: 'Aucun webhook enregistré.' });
    const sent = await postToSlack(target.url, `Message d’essai de *${project.title}* (NTECH Board).`);
    return c.json({ ok: sent.ok, message: sent.ok ? 'Message envoyé dans le canal.' : sent.error });
  });

  // Liaison d'un compte Slack à un membre (page ouverte depuis Slack, membre connecté)

  routes.get('/slack/link/:token', requireRole('viewer'), async c => {
    const slackName = await linkRequest(c.get('project').id, c.req.param('token'));
    if (!slackName)
      return c.json({ error: 'expired', message: 'Ce lien a expiré : relancez /board dans Slack.' }, 410);
    return c.json({ slackName, project: c.get('project').title } satisfies SlackLinkRequest);
  });

  routes.post('/slack/link/:token', requireRole('viewer'), async c => {
    const ok = await confirmLink(c.get('project').id, c.req.param('token'), c.get('user')!.id);
    if (!ok)
      return c.json({ error: 'expired', message: 'Ce lien a expiré : relancez /board dans Slack.' }, 410);
    return c.json({ ok: true });
  });

  // Commande /board (appelée par Slack, authentifiée par sa signature)

  routes.post('/slack/command', async c => {
    const project = c.get('project');
    const raw = await c.req.text();
    const secret = await signingSecret(project.id);
    if (
      !validSlackSignature(
        secret,
        c.req.header('x-slack-request-timestamp') ?? '',
        raw,
        c.req.header('x-slack-signature') ?? '',
      )
    )
      return c.json({ error: 'bad_signature' }, 401);
    const form = new URLSearchParams(raw);
    if (form.get('ssl_check')) return c.body(null, 200);
    const team = form.get('team_id') ?? '';
    const slackUser = form.get('user_id') ?? '';
    const slackName = form.get('user_name') ?? '';
    const reply = (text: string, shared = false) =>
      c.json({ response_type: shared ? 'in_channel' : 'ephemeral', text });
    if (!team || !slackUser) return reply('Requête Slack incomplète.');
    const origin = originOf(c);
    const cmd = parseSlackCommand(form.get('text') ?? '');
    const userId = await linkedUser(project.id, team, slackUser);
    if (!userId) {
      const token = await newLinkToken(project.id, team, slackUser, slackName);
      return reply(
        `Pour agir dans *${project.title}* depuis Slack, reliez d’abord votre compte (une seule fois) : <${origin}/slack/relier?token=${token}|Relier mon compte>. Le lien est valable 30 minutes.`,
      );
    }
    if (cmd.name === 'unlink') {
      await unlink(project.id, team, slackUser);
      return reply('Ce compte Slack n’est plus relié à votre compte du tableau.');
    }
    if (cmd.name === 'help') return reply(HELP);
    const headers = new Headers(internalHeaders(userId));
    for (const h of ['host', 'x-forwarded-host', 'x-forwarded-proto']) {
      const v = c.req.header(h);
      if (v) headers.set(h, v);
    }
    const api: Api = async (method, path, body) => {
      const h = new Headers(headers);
      if (body !== undefined) h.set('content-type', 'application/json');
      const res = await fetchApi(
        new Request(new URL(`/api${path}`, c.req.url), {
          method,
          headers: h,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      if (!res.ok)
        throw new Error(data?.message ?? MESSAGES[data?.error] ?? `Refusé par le tableau (${res.status}).`);
      return data;
    };
    try {
      const r = await runSlackCommand(cmd, {
        api,
        origin,
        userId,
        channel: form.get('channel_name') ?? '',
        slackName,
        ticketsPublished: !!(await slackTarget(project.id))?.events.includes('tickets'),
      });
      return reply(r.text, r.shared);
    } catch (err) {
      fail('slack', `Commande /board (${cmd.name}) sur « ${project.slug} »`, err);
      return reply((err as Error).message || 'La commande a échoué.');
    }
  });

  return routes;
}
