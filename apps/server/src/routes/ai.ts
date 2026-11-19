import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { checkKey } from '../ai/extract';
import { aiKey, aiKeyStatus, AiUnavailable, deleteAiKey, saveAiKey } from '../ai/keys';
import { requireRole, type AppEnv } from '../auth';
import { env } from '../env';
import { canEncrypt, SecretsKeyMissing } from '../files/crypto';
import { fail, log } from '../log';
import { body } from './workspace';

/**
 * Clé Claude du projet : les éditeurs voient si elle est enregistrée, les administrateurs la
 * saisissent, la vérifient ou la retirent. La clé elle-même n'est jamais renvoyée.
 */
export const aiRoutes = new Hono<AppEnv>();
type Ctx = Context<AppEnv>;
const admin = requireRole('admin');
const who = (c: Ctx) => ({
  project: (c.get('project') as { id: string }).id,
  user: c.get('user') as { name: string; email: string },
});

aiRoutes.onError((err, c) => {
  if (err instanceof SecretsKeyMissing)
    return c.json(
      {
        error: 'secrets_key_missing',
        message: 'Le serveur n’a pas de clé SECRETS_KEY : impossible d’enregistrer la clé Claude.',
      },
      400,
    );
  fail('erreur', `${c.req.method} ${new URL(c.req.url).pathname}`, err);
  return c.json({ error: 'server_error' }, 500);
});

const KeyBody = z.object({
  key: z
    .string()
    .trim()
    .regex(/^sk-ant-[\w-]{20,300}$/),
});

aiRoutes.get('/ai', requireRole('editor'), async c =>
  c.json({ ...(await aiKeyStatus(who(c).project)), canEncrypt: canEncrypt(), model: env.ai.model }),
);

/** Enregistre la clé après l'avoir essayée auprès d'Anthropic : une clé refusée n'est pas gardée. */
aiRoutes.put('/ai/key', admin, async c => {
  const input = await body(c.req, KeyBody);
  if (!input)
    return c.json({ error: 'invalid', message: 'Clé invalide : elle commence par « sk-ant- ».' }, 400);
  if (!canEncrypt())
    return c.json(
      {
        error: 'secrets_key_missing',
        message: 'Le serveur n’a pas de clé SECRETS_KEY : impossible d’enregistrer la clé Claude.',
      },
      400,
    );
  const check = await checkKey(input.key);
  if (!check.ok) return c.json({ error: 'rejected', message: check.message }, 400);
  const { project, user } = who(c);
  await saveAiKey(project, input.key, user.name || user.email);
  log('ai', `clé Claude enregistrée pour le projet ${project} par ${user.email}`);
  return c.json(await aiKeyStatus(project));
});

aiRoutes.post('/ai/key/test', admin, async c => {
  try {
    return c.json(await checkKey(await aiKey(who(c).project)));
  } catch (e) {
    if (e instanceof AiUnavailable) return c.json({ ok: false, message: e.message });
    throw e;
  }
});

aiRoutes.delete('/ai/key', admin, async c => {
  const { project, user } = who(c);
  await deleteAiKey(project);
  log('ai', `clé Claude retirée du projet ${project} par ${user.email}`);
  return c.json({ ok: true });
});
