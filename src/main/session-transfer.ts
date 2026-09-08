import { createServer, type Server, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { CookiesSetDetails } from 'electron';

export type Category = 'cookies' | 'localStorage' | 'sessionStorage';
type Entry = { name: string; value: string };
export interface LoginMaterial {
  sourceUrl?: string;
  origin: string;
  selected: Category[];
  cookies: CookiesSetDetails[];
  localStorage: Entry[];
  sessionStorage: Entry[];
}
const categories: Category[] = ['cookies', 'localStorage', 'sessionStorage'];
export function loginOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error('Use HTTPS for website login transfer.');
  return url.origin;
}
const invalid = () => new Error('Invalid or unapproved website login data.');
export function loginMaterial(value: any, origin: string): LoginMaterial {
  if (
    !value ||
    value.approved !== true ||
    !Array.isArray(value.selected) ||
    !value.selected.length ||
    value.selected.some((v: any) => !categories.includes(v)) ||
    new Set(value.selected).size !== value.selected.length
  )
    throw invalid();
  let sourceUrl: string | undefined;
  if (value.origin !== origin) {
    if (
      value.openSourceSite !== true ||
      typeof value.sourceUrl !== 'string' ||
      value.sourceUrl.length > 2048
    )
      throw invalid();
    const url = new URL(value.sourceUrl);
    if (loginOrigin(url.href) !== value.origin || url.search || url.hash) throw invalid();
    sourceUrl = url.href;
  }
  const sourceOrigin = sourceUrl ? loginOrigin(sourceUrl) : origin;
  const result: LoginMaterial = {
    ...(sourceUrl ? { sourceUrl } : {}),
    origin: sourceOrigin,
    selected: value.selected,
    cookies: [],
    localStorage: [],
    sessionStorage: [],
  };
  for (const category of categories) {
    const entries = value[category] ?? [];
    if (
      !Array.isArray(entries) ||
      entries.length > 1000 ||
      (!value.selected.includes(category) && entries.length)
    )
      throw invalid();
    const keys = new Set<string>();
    for (const entry of entries) {
      if (
        !entry ||
        typeof entry.name !== 'string' ||
        typeof entry.value !== 'string' ||
        entry.name.length > 4096 ||
        entry.value.length > 1_000_000
      )
        throw invalid();
      const key =
        category === 'cookies' ? `${entry.name}\0${entry.domain}\0${entry.path}` : entry.name;
      if (keys.has(key)) throw invalid();
      keys.add(key);
      if (category === 'cookies') result.cookies.push(cookie(entry, sourceOrigin));
      else result[category].push({ name: entry.name, value: entry.value });
    }
  }
  return result;
}
function cookie(entry: any, origin: string): CookiesSetDetails {
  const host = new URL(origin).hostname;
  if (
    typeof entry.domain !== 'string' ||
    !entry.domain ||
    typeof entry.path !== 'string' ||
    !entry.path.startsWith('/') ||
    entry.partitionKey
  )
    throw invalid();
  const domain = entry.domain.replace(/^\./, '');
  if (host !== domain && (entry.hostOnly || !host.endsWith('.' + domain) || !domain.includes('.')))
    throw invalid();
  for (const key of ['hostOnly', 'secure', 'httpOnly'])
    if (typeof entry[key] !== 'boolean') throw invalid();
  if (!['unspecified', 'no_restriction', 'lax', 'strict'].includes(entry.sameSite)) throw invalid();
  if (
    entry.expirationDate !== undefined &&
    (!Number.isFinite(entry.expirationDate) || entry.expirationDate <= Date.now() / 1000)
  )
    throw invalid();
  return {
    url: origin + entry.path,
    name: entry.name,
    value: entry.value,
    path: entry.path,
    ...(entry.hostOnly ? {} : { domain: entry.domain }),
    secure: entry.secure,
    httpOnly: entry.httpOnly,
    sameSite: entry.sameSite,
    ...(entry.expirationDate === undefined ? {} : { expirationDate: entry.expirationDate }),
  };
}
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4_000_000) throw invalid();
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export class LoginTransfer {
  private server?: Server;
  private token = '';
  private state: 'waiting' | 'importing' | 'completed' | 'failed' = 'waiting';
  private id = '';
  private error = '';
  async begin(
    origin: string,
    destination: string,
    install: (material: LoginMaterial) => Promise<void>,
  ) {
    if (this.state === 'importing') throw new Error('Wait for the transfer to finish.');
    this.close();
    this.token = randomBytes(32).toString('hex');
    this.id = randomBytes(16).toString('hex');
    this.state = 'waiting';
    this.error = '';
    const token = this.token;
    const server = createServer(async (request, response) => {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'application/json');
      const extension = request.headers.origin;
      const extensionRequest =
        typeof extension === 'string' && /^chrome-extension:\/\/[a-p]{32}$/.test(extension);
      // Chromium omits Origin on privileged extension GETs. The unguessable
      // connection token is still required; uploads must identify an extension.
      const metadataRequest = request.method === 'GET' && extension === undefined;
      if (
        token !== this.token ||
        request.headers.authorization !== `Bearer ${token}` ||
        (!extensionRequest && !metadataRequest)
      ) {
        response.writeHead(403).end('{}');
        return;
      }
      if (request.method === 'GET' && request.url === '/request' && this.state === 'waiting') {
        response.end(JSON.stringify({ origin, destination, supportsSourceSite: true }));
        return;
      }
      if (request.method !== 'POST' || request.url !== '/import' || this.state !== 'waiting') {
        response.writeHead(409).end('{}');
        return;
      }
      let material: LoginMaterial;
      try {
        material = loginMaterial(await body(request), origin);
      } catch {
        response
          .writeHead(400)
          .end(JSON.stringify({ error: 'Invalid or unapproved website login data.' }));
        return;
      }
      // Consume before awaiting the installer; concurrent uploads cannot reuse approval.
      if (this.state !== 'waiting' || token !== this.token) {
        response.writeHead(409).end('{}');
        return;
      }
      this.state = 'importing';
      try {
        await install(material);
        this.state = 'completed';
        response.end(JSON.stringify({ ok: true }));
      } catch {
        this.state = 'failed';
        this.error =
          'Transfer could not finish. Some state may have been imported. Check the website, then start a new transfer if needed.';
        response.writeHead(409).end(JSON.stringify({ error: this.error }));
      } finally {
        this.token = '';
        server.close();
      }
    });
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as { port: number }).port;
    return { id: this.id, code: `${port}.${token}`, origin, destination };
  }
  connectionCode(id: string) {
    this.status(id);
    const address = this.server?.address();
    if (this.state !== 'waiting' || !this.token || !address || typeof address === 'string')
      throw new Error('Start a new transfer to copy its code.');
    return `${address.port}.${this.token}`;
  }
  status(id: string) {
    if (id !== this.id) throw new Error('This transfer is no longer available.');
    return { state: this.state, error: this.error };
  }
  cancel(id: string) {
    if (id !== this.id) return false;
    if (this.state === 'importing') throw new Error('Wait for the transfer to finish.');
    this.close();
    return true;
  }
  close() {
    this.token = '';
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = undefined;
  }
}
