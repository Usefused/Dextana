import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export class Fault extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const requireValue = (value, message) => {
  if (!value) throw new Fault(400, message);
  return value;
};
export function seal(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, cipher.update(value), cipher.final(), cipher.getAuthTag()]).toString(
    'base64',
  );
}
export function unseal(value, key) {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString();
}
export async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const reader = response.body?.getReader();
  const chunks = [];
  let total = 0;
  if (reader)
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 8_000_000) {
        await reader.cancel();
        throw new Fault(502, 'Service response exceeded its limit.');
      }
      chunks.push(Buffer.from(value));
    }
  const bytes = Buffer.concat(chunks);
  if (!response.ok) throw new Fault(502, 'The upstream service could not complete this request.');
  try {
    return JSON.parse(Buffer.from(bytes).toString());
  } catch {
    throw new Fault(502, 'Invalid upstream response.');
  }
}
export function validateOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('Service URLs require HTTPS.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('Use a service origin without a path or credentials.');
  return url.origin;
}
