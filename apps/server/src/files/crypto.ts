import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../env';

/** Chiffrement des secrets en base : AES-256-GCM, clé dérivée de SECRETS_KEY. Format « v1.iv.tag.données » (base64url). */

export class SecretsKeyMissing extends Error {}

const key = () => {
  if (!env.secretsKey) throw new SecretsKeyMissing('SECRETS_KEY manquante');
  return createHash('sha256').update(env.secretsKey).digest();
};

export const canEncrypt = () => !!env.secretsKey;

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map(x => (typeof x === 'string' ? x : x.toString('base64url')))
    .join('.');
}

export function decrypt(stored: string) {
  const [v, iv, tag, data] = stored.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('secret illisible');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
