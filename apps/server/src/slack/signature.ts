import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signature Slack : HMAC-SHA256 de « v0:horodatage:corps » avec le secret de l'application, à 5 minutes près. */
export function validSlackSignature(
  secret: string,
  timestamp: string,
  raw: string,
  signature: string,
  now = Date.now(),
) {
  if (!secret || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
