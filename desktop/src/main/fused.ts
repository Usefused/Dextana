import { safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { backendMCP } from './backend-mcp';
import type { Runtime } from './runtime';
import type { FusedInput, FusedIntegration } from '../shared/types';
import { Store } from './store';
import { endpoint } from './settings';

export class Fused {
  managedCredentials?: () => Promise<{ token: string; tokenId: string; url: string }>;
  private clients = new Map<string, { integrationId: string; pending: Promise<Client> }>();
  private saving = Promise.resolve();
  constructor(
    private store: Store,
    private directory: string,
    private runtime?: Runtime,
  ) {}
  private path(secretId: string) {
    return join(
      this.directory,
      secretId === 'legacy' ? 'fused-token.enc' : `fused-${secretId}.enc`,
    );
  }
  saveAccount(input: { url: string; licenseKey: string }) {
    return this.exclusive(async () => {
      if (!input || typeof input.licenseKey !== 'string' || input.licenseKey.length > 16000 || /[\r\n]/.test(input.licenseKey)) throw new Error('Enter a valid Fused license key.');
      const url = endpoint(input.url);
      const previous = this.store.state.fusedAccount;
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('A system keyring is required to store the license key securely.');
      const key = input.licenseKey.trim() || (previous?.url === url ? safeStorage.decryptString(await readFile(this.path(previous.secretId))) : '');
      if (!key) throw new Error('Enter a license key for this Fused URL.');
      try {
        const response = await fetch(`${url}/auth/whoami`, { headers: { 'X-API-Key': key }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        await response.body?.cancel();
        if (!response.ok) throw new Error('Authentication failed');
      } catch { throw new Error('Could not verify your Fused account. Check the URL, license key, and Engine availability.'); }
      const secretId = randomUUID();
      await writeFile(this.path(secretId), safeStorage.encryptString(key), { mode: 0o600, flag: 'wx' });
      this.store.state.fusedAccount = { url, secretId, connectedAt: new Date().toISOString() };
      try { await this.store.save(); }
      catch (error) { this.store.state.fusedAccount = previous; await rm(this.path(secretId), { force: true }).catch(() => {}); throw error; }
      if (previous) await rm(this.path(previous.secretId), { force: true }).catch(() => {});
    });
  }
  removeAccount() {
    return this.exclusive(async () => {
      const previous = this.store.state.fusedAccount;
      if (!previous) return;
      delete this.store.state.fusedAccount;
      try { await this.store.save(); }
      catch (error) { this.store.state.fusedAccount = previous; throw error; }
      await rm(this.path(previous.secretId), { force: true });
    });
  }
  connections() {
    return (this.store.state.fusedIntegrations ?? [])
      .filter((item) => item.enabled)
      .map(({ id, name, url }) => ({ id, name, url }));
  }
  resolve(id: unknown = ''): FusedIntegration {
    if (typeof id !== 'string') throw new Error('Choose a Fused integration ID from connections.');
    const enabled = (this.store.state.fusedIntegrations ?? []).filter((item) => item.enabled);
    if (!id && enabled.length > 1)
      throw new Error(
        'Multiple Fused integrations are enabled. Call connections and supply integration_id.',
      );
    const integration = id ? enabled.find((item) => item.id === id) : enabled[0];
    if (!integration)
      throw new Error('Fused integration is disabled or unavailable. Check Settings.');
    return integration;
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.saving.then(operation);
    this.saving = pending.then(
      () => {},
      () => {},
    );
    return pending;
  }
  save(input: FusedInput) {
    return this.exclusive(async () => {
      if (
        !input ||
        typeof input.enabled !== 'boolean' ||
        typeof input.token !== 'string' ||
        input.token.length > 16000 ||
        (input.name !== undefined && typeof input.name !== 'string')
      )
        throw new Error('Invalid Fused settings.');
      const previousList = this.store.state.fusedIntegrations ?? [];
      const previous = input.id ? previousList.find((item) => item.id === input.id) : undefined;
      if (input.id && !previous) throw new Error('Fused integration not found.');
      const name = (input.name ?? previous?.name ?? 'Fused').trim();
      if (!name || name.length > 80)
        throw new Error('Enter an integration name up to 80 characters.');
      if (
        previousList.some(
          (item) => item.id !== previous?.id && item.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new Error('An integration with this name already exists.');
      const url = input.enabled ? endpoint(input.url) : input.url ? endpoint(input.url) : '';
      let secretId = previous?.url === url ? previous.secretId : undefined;
      if (input.enabled && !input.token && !secretId)
        throw new Error('Enter a Fused execution token for this address.');
      let newSecret: string | undefined;
      if (input.token) {
        if (
          !safeStorage.isEncryptionAvailable() ||
          (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
        )
          throw new Error('A system keyring is required to save the Fused token securely.');
        newSecret = randomUUID();
        await writeFile(this.path(newSecret), safeStorage.encryptString(input.token), {
          mode: 0o600,
          flag: 'wx',
        });
        secretId = newSecret;
      }
      const integration: FusedIntegration = {
        id: previous?.id ?? randomUUID(),
        name,
        enabled: input.enabled,
        url,
        secretId,
        hasToken: !!secretId,
        revision: randomUUID(),
      };
      this.store.state.fusedIntegrations = previous
        ? previousList.map((item) => (item.id === previous.id ? integration : item))
        : [...previousList, integration];
      try {
        await this.store.save();
      } catch (error) {
        this.store.state.fusedIntegrations = previousList;
        if (newSecret) await rm(this.path(newSecret), { force: true }).catch(() => {});
        throw error;
      }
      await this.close(integration.id);
      if (previous?.secretId && previous.secretId !== secretId)
        await rm(this.path(previous.secretId), { force: true }).catch(() => {});
      return integration.id;
    });
  }
  remove(id: string) {
    return this.exclusive(async () => {
      const previous = this.store.state.fusedIntegrations ?? [];
      const integration = previous.find((item) => item.id === id);
      if (!integration) throw new Error('Fused integration not found.');
      this.store.state.fusedIntegrations = previous.filter((item) => item.id !== id);
      try {
        await this.store.save();
      } catch (error) {
        this.store.state.fusedIntegrations = previous;
        throw error;
      }
      await this.close(id);
      if (integration.secretId)
        await rm(this.path(integration.secretId), { force: true }).catch(() => {});
    });
  }
  private async connect(settings: FusedIntegration, managed?: { token: string; url: string }) {
    if (managed) {
      if (!this.runtime) throw new Error('The MCP backend is unavailable.');
      return backendMCP(this.runtime, { transport: 'http', url: managed.url, token: managed.token });
    }
    if (!settings.secretId) throw new Error('Save an execution token for this integration.');
    const token = safeStorage.decryptString(await readFile(this.path(settings.secretId)));
    if (!this.runtime) throw new Error('The MCP backend is unavailable.');
    return backendMCP(this.runtime, { transport: 'http', url: settings.url, token });
  }
  async call(
    activityId: string,
    action: unknown,
    argumentsJson: unknown,
    signal: AbortSignal,
    integrationId: unknown = '',
    revision?: string,
  ) {
    signal.throwIfAborted();
    const settings = this.resolve(integrationId);
    if (revision && settings.revision !== revision)
      throw new Error('The Fused integration changed. Request permission again.');
    if (!['list', 'search_docs', 'execute'].includes(String(action)))
      throw new Error('Only Fused discovery and execution tools are supported.');
    if (typeof argumentsJson !== 'string' || argumentsJson.length > 256_000)
      throw new Error('Invalid Fused arguments.');
    const args = JSON.parse(argumentsJson || '{}');
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('Fused arguments must be a JSON object.');
    const managed = settings.managed === 'dext' ? await this.managedCredentials?.() : undefined;
    if (settings.managed === 'dext' && !managed) throw new Error('Open Settings → Integrations to reconnect.');
    if (this.resolve(settings.id).revision !== settings.revision) throw new Error('Integrations changed. Request permission again.');
    const key = JSON.stringify([activityId, settings.id, settings.revision, managed?.tokenId]);
    let entry = this.clients.get(key);
    if (!entry) {
      const pending = this.connect(settings, managed);
      entry = { integrationId: settings.id, pending };
      this.clients.set(key, entry);
      pending.catch(() => this.clients.delete(key));
    }
    const client = await entry.pending;
    signal.throwIfAborted();
    if (this.resolve(settings.id).revision !== settings.revision)
      throw new Error('The Fused integration changed. Request permission again.');
    try {
      if (action === 'list') return await client.listTools({}, { signal, timeout: 30_000 });
      return await client.callTool({ name: String(action), arguments: args }, undefined, {
        signal,
        timeout: 60_000,
      });
    } catch {
      throw new Error(
        action === 'execute'
          ? 'Fused execution did not return a result. Its outcome may be unknown; inspect the destination before retrying.'
          : 'Fused discovery failed. Check the connection in Settings.',
      );
    }
  }
  async close(integrationId?: string) {
    const closing = [...this.clients].filter(
      ([, entry]) => !integrationId || entry.integrationId === integrationId,
    );
    for (const [key] of closing) this.clients.delete(key);
    await Promise.allSettled(closing.map(async ([, entry]) => (await entry.pending).close()));
  }
}
