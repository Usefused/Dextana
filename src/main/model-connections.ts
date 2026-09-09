import { safeStorage } from 'electron';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Settings } from '../shared/types';
import { endpoint, getCompatibleModels, getModels, settingsFrom } from './settings';
import type { Runtime } from './runtime';

type Connection = { id: string; provider: 'ollama' | 'openai'; base: string; apiKey: string };
const validId = /^[a-f0-9-]{36}$/;

/** Keys stay in OS-encrypted files and the authenticated backend's memory. */
export class ModelConnections {
  private directory: string;
  constructor(directory: string, private current: () => Settings) {
    this.directory = join(directory, 'model-connections');
  }
  private encryption() {
    if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('Secure key storage is unavailable. Enable your system keychain and try again.');
  }
  private async read(id: string): Promise<Connection> {
    if (!validId.test(id)) throw new Error('Invalid model connection.');
    this.encryption();
    return JSON.parse(safeStorage.decryptString(await readFile(join(this.directory, id))));
  }
  private async key(settings: Settings, apiKey?: string) {
    if (apiKey !== undefined) {
      if (typeof apiKey !== 'string' || apiKey.length > 8192 || /[\r\n]/.test(apiKey)) throw new Error('Invalid API key.');
      return apiKey.trim();
    }
    const saved = this.current();
    if (saved.connectionId && saved.provider === settings.provider && endpoint(saved.ollamaUrl) === endpoint(settings.ollamaUrl)) return (await this.read(saved.connectionId)).apiKey;
    return '';
  }
  async models(value: string | Settings, apiKey?: string) {
    const settings = typeof value === 'string' ? { ollamaUrl: value, models: [] } : value;
    return settings.provider === 'openai' ? getCompatibleModels(settings.ollamaUrl, await this.key(settings, apiKey)) : getModels(settings.ollamaUrl);
  }
  async save(value: Settings, apiKey?: string): Promise<Settings> {
    const settings = settingsFrom(value);
    if (settings.provider !== 'openai') return settings;
    const key = await this.key(settings, apiKey);
    const current = this.current();
    if (apiKey === undefined && current.connectionId && current.provider === settings.provider && endpoint(current.ollamaUrl) === settings.ollamaUrl) return { ...settings, connectionId: current.connectionId, hasApiKey: !!key };
    const id = randomUUID();
    const connection: Connection = { id, provider: 'openai', base: settings.ollamaUrl, apiKey: key };
    // Even keyless connections are encrypted so their storage format stays consistent.
    this.encryption();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, id), safeStorage.encryptString(JSON.stringify(connection)), { mode: 0o600, flag: 'wx' });
    return { ...settings, connectionId: id, hasApiKey: !!key };
  }
  async sync(runtime: Runtime) {
    const entries = await readdir(this.directory).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
    const connections = await Promise.all(entries.filter(id => validId.test(id)).map(id => this.read(id)));
    const response = await runtime.request('/dextana/activity/model-connections', { method: 'POST', body: JSON.stringify({ connections }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Could not configure model connections in the backend.');
  }
}
