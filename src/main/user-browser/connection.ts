import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import type { UserBrowserCommand, UserBrowserState } from '../../shared/user-browser';
import { browserResult, readBody } from './protocol';
import { browserArguments } from './actions';

import { UserBrowserTabs } from './tabs';
import { BrowserRequests } from './requests';
import { BrowserAttachment } from './attachment';
import { UserBrowserDownloads } from './downloads';

class ExtensionUpdateRequired extends Error {}

/** An extension-approved browser connection shared by authorized chats within its granted scope. */
export class UserBrowserConnection {
  readonly state: UserBrowserState;
  private server?: Server;
  private token = randomBytes(32).toString('hex');
  private requests = new BrowserRequests();
  private tabs: UserBrowserTabs;
  private attachment = new BrowserAttachment();
  private downloads = new UserBrowserDownloads();
  private revision = 0;
  private expiry?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setTimeout>;
  constructor(
    activityId: string,
    private destination: string,
    private origin: string,
    private changed: () => void,
  ) {
    this.state = {
      id: randomUUID(),
      activityId,
      state: 'waiting',
      title: 'Your browser',
      url: '',
      tabs: [],
    };
    this.tabs = new UserBrowserTabs(this.state);
  }
  async start() {
    const server = createServer((request, response) => {
      void this.route(request, response).catch((error) => {
        if (!response.writableEnded)
          response.writeHead(400).end(
            JSON.stringify({
              error:
                error instanceof ExtensionUpdateRequired
                  ? 'extension_update_required'
                  : 'invalid_request',
            }),
          );
      });
    });
    this.server = server;
    server.requestTimeout = 30_000;
    server.headersTimeout = 10_000;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    this.expiry = setTimeout(
      () => this.stop('The browser connection expired. Attach the tab again.'),
      900_000,
    );
    this.expiry.unref();
    this.changed();
    return {
      id: this.state.id,
      code: `${(server.address() as { port: number }).port}.${this.token}`,
    };
  }
  pairing() {
    const address = this.server?.address();
    if (this.state.state !== 'waiting' || !address || typeof address === 'string') return;
    return { id: this.state.id, code: `${address.port}.${this.token}` };
  }
  async requestAttachment(signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.state.state === 'stopped')
      throw new Error('Browser connection stopped. Request a new connection.');
    if (this.state.state === 'waiting') {
      this.state.requested = true;
      const waiting = this.attachment.wait(signal, () =>
        this.stop('Browser connection request cancelled.'),
      );
      this.changed();
      await waiting;
    }
    signal.throwIfAborted();
    if (this.state.state !== 'connected') throw new Error('Browser connection ended.');
    return {
      ...this.tabs.list(),
      message:
        'Your external browser is connected. No page action was executed by connecting. Use the returned tabs or new_tab to continue the task.',
    };
  }
  private authorized(request: IncomingMessage) {
    if (!this.token || request.headers.authorization !== `Bearer ${this.token}`) return false;
    const address = this.server?.address();
    if (
      !address ||
      typeof address === 'string' ||
      request.headers.host !== `127.0.0.1:${address.port}`
    )
      return false;
    const source = request.headers.origin;
    return source === this.origin || (source === undefined && request.method === 'GET');
  }
  private async route(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (!this.authorized(request)) {
      response.writeHead(403).end('{}');
      return;
    }
    const value = await this.handle(request);
    response.end(JSON.stringify(value));
  }
  private async handle(request: IncomingMessage) {
    if (request.method === 'GET') return this.get(request.url);
    if (request.method !== 'POST') throw new Error('Unsupported browser request.');
    if (request.url === '/attach') return this.attach(await readBody(request));
    if (this.state.state !== 'connected') throw new Error('No attached tab.');
    if (request.url === '/resume') return this.resume(await readBody(request));
    if (request.url === '/tabs') return this.updateTabs(await readBody(request));
    if (request.url === '/result') return this.result(await readBody(request));
    if (request.url === '/stop') {
      this.stop('Stopped from your browser.');
      return {};
    }
    throw new Error('Unsupported browser request.');
  }
  private get(path = '/') {
    const url = new URL(path, 'http://127.0.0.1');
    if (url.pathname === '/request')
      return { mode: 'browser-control', protocol: 4, destination: this.destination };
    if (this.state.state !== 'connected') throw new Error('No attached browser session.');
    if (url.pathname === '/next') {
      this.pulse();
      return this.requests.next();
    }
    if (url.pathname === '/active')
      return this.requests.active(url.searchParams.get('requestId') ?? '');
    throw new Error('Unsupported browser request.');
  }
  private attach(input: Record<string, unknown>) {
    if (input.protocol !== 4 || !['browser', 'tabs'].includes(String(input.scope)))
      throw new ExtensionUpdateRequired();
    if (this.state.state !== 'waiting' || input.approved !== true || input.allowNewTabs !== true)
      throw new Error('Approve the selected tabs and new tabs for this browser session.');
    this.state.scope = input.scope as 'browser' | 'tabs';
    this.tabs.attach(input.tabs);
    this.downloads.update(input.downloads);
    clearTimeout(this.expiry);
    this.state.state = 'connected';
    this.attachment.connected();
    this.pulse();
    this.changed();
    return { ok: true };
  }
  private updateTabs(input: Record<string, unknown>) {
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) <= 0)
      throw new Error('Invalid tab inventory revision.');
    if (Number(input.revision) <= this.revision) return { ok: true };
    this.tabs.update(input.tabs);
    this.downloads.update(input.downloads);
    this.revision = Number(input.revision);
    this.requests.closeTabs(
      this.state.tabs.filter((tab) => tab.state === 'closed').map((tab) => tab.id),
    );
    this.changed();
    return { ok: true };
  }
  private resume(input: Record<string, unknown>) {
    // Lost workers cannot replay an uncertain action or reuse a stale observation.
    this.requests.stop('Browser reconnected. Inspect any uncertain outcome before retrying.');
    this.tabs.clearObservations();
    this.revision = 0;
    this.updateTabs(input);
    this.pulse();
    return { ok: true };
  }
  private pulse() {
    const recovered = this.state.reconnecting;
    this.state.reconnecting = false;
    if (recovered) this.changed();
    clearTimeout(this.heartbeat);
    this.heartbeat = setTimeout(() => {
      this.state.reconnecting = true;
      this.requests.stop(
        'Browser temporarily disconnected. Wait for it to reconnect, then inspect the page.',
      );
      this.tabs.clearObservations();
      this.changed();
    }, 60_000);
    this.heartbeat.unref();
  }
  private result(input: Record<string, unknown>) {
    const pending = this.requests.take(input.requestId);
    try {
      const result = browserResult(input.value, pending.command.tabId);
      const stale = this.tabs.complete(
        pending.command.action,
        pending.command.tabId,
        result,
        pending.command.expectedURL,
      );
      pending.resolve(stale ?? result);
      this.changed();
    } catch (error) {
      pending.reject(error as Error);
      this.stop('The browser result could not be verified. Reconnect.');
    }
    return { ok: true };
  }
  prepare(args: Record<string, unknown>): Record<string, unknown> {
    if (this.state.reconnecting)
      throw new Error(
        'Your browser is reconnecting automatically. Wait for the connection to return.',
      );
    if (this.state.state !== 'connected')
      throw new Error('Attach your browser again, or switch to the Dext browser.');
    const input: Record<string, unknown> = browserArguments(args);
    if (input.action === 'list_tabs') return { ...input, _userConnection: this.state.id };
    if (input.action === 'downloads') {
      const tab = this.tabs.target(args);
      return { ...input, tab_id: tab.id, _userConnection: this.state.id };
    }
    const tab = this.tabs.target(args);
    if (input.action === 'close_tab' && !tab.created)
      throw new Error(
        'Only Dext-created tabs can be closed by the agent. Close your existing tab in the browser.',
      );
    const target = this.tabs.label(tab.id, input.ref);
    return {
      ...input,
      tab_id: tab.id,
      _userConnection: this.state.id,
      _userURL: tab.url,
      _userTitle: tab.title,
      ...(target ? { _userTarget: target } : {}),
    };
  }
  execute(
    args: Record<string, unknown>,
    signal: AbortSignal,
    activityId: string,
    activityTabs: ReadonlySet<string>,
  ) {
    signal.throwIfAborted();
    if (this.state.state !== 'connected') throw new Error('Attach your browser again.');
    if (args.action === 'list_tabs') return Promise.resolve(this.tabs.list());
    if (args.action === 'downloads') return Promise.resolve(this.downloads.list(activityTabs));
    this.validateExecution(args);
    const tabId = String(args.tab_id);
    this.requests.assertAvailable(tabId);
    return this.requests.add(
      {
        requestId: randomUUID(),
        action: String(args.action),
        tabId,
        arguments: browserArguments(args),
        expectedURL: String(args._userURL),
      },
      signal,
      activityId,
    );
  }
  private validateExecution(args: Record<string, unknown>) {
    if (args.action === 'new_tab') {
      this.tabs.checkCapacity(this.requests.newTabCount());
      this.tabs.consume(args);
      return;
    }
    const prepared = this.prepare(args);
    if (prepared._userURL !== args._userURL)
      throw new Error('The page changed while awaiting approval. Read it again.');
  }
  release(activityId: string) {
    this.requests.release(activityId);
  }
  stop(message: string) {
    if (this.state.state === 'stopped') return;
    this.state.state = 'stopped';
    this.state.message = message;
    this.token = '';
    clearTimeout(this.expiry);
    clearTimeout(this.heartbeat);
    this.requests.stop(message);
    this.attachment.stopped(message);
    this.server?.close();
    this.changed();
  }
}
