import initialCatalog from '../shared/integrations-catalog.json';
import { app, safeStorage, shell } from 'electron';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  IntegrationsAccount,
  IntegrationsCatalog,
  IntegrationsCommand,
  IntegrationsResult,
} from '../shared/integrations';
import type { Store } from './store';
import type { Fused } from './fused';
const integrationId = 'dext-integrations';
export class DextIntegrations {
  private origin?: string;
  private session?: string;
  private loaded = false;
  private activeToken?: string;
  private lastConnect = new Map<string, number>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private directory: string,
    private store: Store,
    private fused: Fused,
    private publish: () => void,
  ) {
    const configured =
      process.env.DEXT_INTEGRATIONS_URL || (!app.isPackaged ? 'http://127.0.0.1:8787' : undefined);
    if (configured) {
      const url = new URL(configured);
      if (
        (url.protocol !== 'https:' &&
          !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error('DEXT_INTEGRATIONS_URL must be an HTTPS service origin.');
      this.origin = url.origin;
    }
    fused.managedCredentials = () => this.credentials();
  }
  private async load() {
    if (this.loaded) return;
    try {
      this.session = safeStorage.decryptString(
        await readFile(join(this.directory, 'integrations-session.enc')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Could not unlock Dext Integrations.');
    }
    this.loaded = true;
  }
  private async request<T>(path: string, input?: unknown, authenticated = true): Promise<T> {
    if (!this.origin)
      throw new Error('Dext Integrations is not available on this installation yet.');
    await this.load();
    if (authenticated && !this.session) throw new Error('Sign in to Dext Integrations.');
    const response = await fetch(`${this.origin}/v1/${path}`, {
      method: input === undefined ? 'GET' : 'POST',
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${this.session}` } : {}),
        'Content-Type': 'application/json',
      },
      body: input === undefined ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Integrations returned too much data.');
    const result = JSON.parse(text);
    if (!response.ok) {
      if (
        path === 'credentials' &&
        response.status === 409 &&
        typeof result.connection?.provider === 'string' &&
        typeof result.connection.url === 'string'
      ) {
        const connectionKey = `${result.connection.provider}:${typeof result.connection.accountId === 'string' ? result.connection.accountId : ''}`;
        const last = this.lastConnect.get(connectionKey) ?? 0;
        if (Date.now() - last > 60_000) {
          await this.open(result.connection.url);
          this.lastConnect.set(connectionKey, Date.now());
        }
      }
      if (response.status === 401 && authenticated) {
        this.session = undefined;
        await rm(join(this.directory, 'integrations-session.enc'), { force: true });
        await this.disable();
      }
      throw new Error(
        typeof result.error === 'string'
          ? result.error.slice(0, 250)
          : 'Integrations request failed.',
      );
    }
    return result;
  }
  private async disable() {
    const integration = this.store.state.fusedIntegrations?.find(
      (item) => item.id === integrationId,
    );
    if (integration) {
      integration.enabled = false;
      integration.hasToken = false;
      await this.fused.close(integrationId);
      await this.store.save();
      this.publish();
    }
  }
  private async sync(account: IntegrationsAccount) {
    const entries = (this.store.state.fusedIntegrations ??= []);
    const previous = entries.find((item) => item.id === integrationId);
    const enabled = account.subscribed && account.enabled.length > 0;
    const url = new URL(account.mcpUrl);
    if (
      url.origin !== 'https://fused.run.usefused.com' ||
      !/^\/mcp\/[a-f0-9-]+$/.test(url.pathname)
    )
      throw new Error('Unexpected Dext Integrations MCP address.');
    if (previous?.revision === account.revision && previous.enabled === enabled) return;
    const integration = {
      id: integrationId,
      name: 'Dext Integrations',
      url: account.mcpUrl,
      enabled,
      hasToken: enabled,
      managed: 'dext' as const,
      revision: account.revision,
    };
    if (previous) entries[entries.indexOf(previous)] = integration;
    else entries.push(integration);
    await this.fused.close(integrationId);
    await this.store.save();
    this.publish();
  }
  async credentials() {
    const account = await this.request<IntegrationsAccount>('account');
    await this.sync(account);
    if (!account.subscribed || !account.enabled.length)
      throw new Error('Subscribe and enable an integration in Settings → Integrations.');
    const credentials = await this.request<{
      token: string;
      tokenId: string;
      expiresAt: number;
      url: string;
    }>('credentials', {});
    if (
      credentials.url !== account.mcpUrl ||
      !credentials.token ||
      /[\r\n]/.test(credentials.token) ||
      credentials.token.length > 16000 ||
      credentials.expiresAt <= Date.now()
    )
      throw new Error('Invalid integration credentials.');
    if (this.activeToken !== credentials.tokenId) {
      await this.fused.close(integrationId);
      this.activeToken = credentials.tokenId;
    }
    return { token: credentials.token, tokenId: credentials.tokenId, url: credentials.url };
  }
  command(input: IntegrationsCommand): Promise<IntegrationsResult> {
    const result = this.pending.catch(() => {}).then(() => this.run(input));
    this.pending = result;
    return result;
  }
  private async open(url: string, stripe = false) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (stripe && !['checkout.stripe.com', 'billing.stripe.com'].includes(parsed.hostname))
    )
      throw new Error('The service returned an invalid authorization link.');
    await shell.openExternal(url);
  }
  private async run(input: IntegrationsCommand): Promise<IntegrationsResult> {
    if (!this.origin) return { configured: false, catalog: initialCatalog };
    if (!input || typeof input.action !== 'string')
      throw new Error('Choose an integrations action.');
    let challengeId: string | undefined;
    if (input.action === 'register' || input.action === 'login') {
      const result = await this.request<{ challengeId: string; checkoutUrl?: string }>(
        input.action,
        input,
        false,
      );
      challengeId = result.challengeId;
      if (result.checkoutUrl) await this.open(result.checkoutUrl, true);
    } else if (input.action === 'verify') {
      if (
        !safeStorage.isEncryptionAvailable() ||
        (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
      )
        throw new Error('A system keyring is required to sign in securely.');
      const result = await this.request<{ sessionToken: string }>('verify', input, false);
      if (!/^[A-Za-z0-9_-]{40,100}$/.test(result.sessionToken))
        throw new Error('Invalid sign-in response.');
      const path = join(this.directory, 'integrations-session.enc');
      await writeFile(`${path}.tmp`, safeStorage.encryptString(result.sessionToken), {
        mode: 0o600,
      });
      await rename(`${path}.tmp`, path);
      this.session = result.sessionToken;
    } else if (input.action === 'connect') {
      const result = await this.request<{ url: string }>('providers/connect', {
        provider: input.provider,
        accountId: input.accountId,
      });
      await this.open(result.url);
    } else if (input.action === 'add-account') {
      const result = await this.request<{ url: string }>('provider-accounts/add', {
        provider: input.provider,
        label: input.label,
      });
      await this.open(result.url);
    } else if (input.action === 'select-account') {
      await this.request('provider-accounts/select', {
        provider: input.provider,
        accountId: input.accountId,
      });
    } else if (input.action === 'enable') {
      await this.request('providers/enable', { provider: input.provider, enabled: input.enabled });
    } else if (input.action === 'activate') await this.credentials();
    else if (input.action === 'checkout' || input.action === 'billing') {
      const result = await this.request<{ url: string }>(input.action, {});
      await this.open(result.url, true);
    } else if (input.action === 'logout') {
      await this.request('logout', {});
      this.session = undefined;
      await rm(join(this.directory, 'integrations-session.enc'), { force: true });
      await this.disable();
    } else if (input.action !== 'view') throw new Error('Unknown integrations action.');
    let catalog: IntegrationsCatalog;
    try {
      catalog = await this.request<IntegrationsCatalog>('catalog', undefined, false);
    } catch (error) {
      if (input.action !== 'view') throw error;
      return { configured: true, connected: false, catalog: initialCatalog };
    }
    const account = this.session ? await this.request<IntegrationsAccount>('account') : undefined;
    if (account) await this.sync(account);
    return { configured: true, connected: true, catalog, account, challengeId };
  }
}
