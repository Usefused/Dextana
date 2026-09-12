import { externalURL } from '../shared/links';
import { imageLimit } from '../shared/images';

export async function loadImage(value: unknown): Promise<string> {
  if (typeof value !== 'string' || value.length > 4096 || !externalURL(value))
    throw new Error('Use an HTTP or HTTPS image URL.');
  const response = await fetch(value, {
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp' },
  });
  try {
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (
      !response.ok ||
      !response.body ||
      !type ||
      !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(type)
    )
      throw new Error('The address did not return a supported image.');
    if (Number(response.headers.get('content-length')) > imageLimit)
      throw new Error('Images must be smaller than 5 MB.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > imageLimit) throw new Error('Images must be smaller than 5 MB.');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (rasterType(bytes) !== type) throw new Error('The image format did not match its content.');
    return `data:${type};base64,${bytes.toString('base64')}`;
  } finally {
    if (response.body && !response.body.locked) await response.body.cancel().catch(() => {});
  }
}

export function rasterType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
}
