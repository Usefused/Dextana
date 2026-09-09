import { safeStorage } from 'electron';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { compatibleReasoning } from '../shared/model-reasoning';
import type { ReasoningSupport, Settings } from '../shared/types';
import { endpoint, getCompatibleModelCatalog, getModelCatalog, settingsFrom, modelReasoning, compatibleModelDetails } from './settings';
import type { Runtime } from './runtime';
import { defaultModelAuth, modelAuth, modelHeaders, type ModelAuth } from '../shared/model-auth';

type Connection = { id: string; provider: 'ollama' | 'openai'; base: string; apiKey: string; auth?: ModelAuth };
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
  async reasoning(value: string, model: string): Promise<ReasoningSupport> {
    const saved = this.current();
    if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new Error('Choose a model.');
    if (endpoint(value) !== endpoint(saved.ollamaUrl)) throw new Error('The model connection changed. Choose the model again.');
    if (saved.provider !== 'openai') return modelReasoning(value, model);
    const details = await compatibleModelDetails(value, await this.key(saved), await this.auth(saved));
    return compatibleReasoning(details.find(item => item.id === model), new URL(value).hostname === 'openrouter.ai');
  }
  async models(value: string | Settings, apiKey?: string) {
    return (await this.modelCatalog(value, apiKey)).chat;
  }
  private async auth(settings: Settings, value?: ModelAuth): Promise<ModelAuth> {
    if (value !== undefined) return modelAuth(value);
    const saved = this.current();
    if (saved.connectionId && saved.provider === settings.provider && endpoint(saved.ollamaUrl) === endpoint(settings.ollamaUrl))
      return modelAuth((await this.read(saved.connectionId)).auth ?? defaultModelAuth());
    return defaultModelAuth();
  }
  private async verify(settings: Settings, key: string, auth: ModelAuth) {
    if (endpoint(settings.ollamaUrl) !== 'https://openrouter.ai/api/v1') return;
    const response = await fetch('https://openrouter.ai/api/v1/key', { headers: modelHeaders(key, auth), redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (response.status === 401 || response.status === 403)
      throw new Error('OpenRouter did not accept this API key. Enter a key created in your OpenRouter account, then fetch models again.');
    if (!response.ok) throw new Error(`Could not validate the OpenRouter connection (HTTP ${response.status}). Try again.`);
  }
  async modelCatalog(value: string | Settings, apiKey?: string, authInput?: ModelAuth) {
    const settings = typeof value === 'string' ? { ollamaUrl: value, models: [] } : value;
    if (settings.provider !== 'openai') return getModelCatalog(settings.ollamaUrl);
    const key = await this.key(settings, apiKey), auth = await this.auth(settings, authInput);
    await this.verify(settings, key, auth);
    return getCompatibleModelCatalog(settings.ollamaUrl, key, auth);
  }
  async save(value: Settings, apiKey?: string, runtime?: Runtime, authInput?: ModelAuth): Promise<Settings> {
    const settings = settingsFrom(value);
    const key = settings.provider === 'openai' ? await this.key(settings, apiKey) : '';
    const auth = settings.provider === 'openai' ? await this.auth(settings, authInput) : defaultModelAuth();
    if (settings.provider === 'openai') await this.verify(settings, key, auth);
    if (settings.imageInterpreterModel && settings.provider !== 'openai') {
      const response = await fetch(`${settings.ollamaUrl}/api/show`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.imageInterpreterModel }),
        signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (!response.ok || !(await response.json()).capabilities?.includes('vision'))
        throw new Error('The image interpreter must support image input. Choose a vision-capable model.');
    }
    if (settings.embeddingModel) {
      if (!runtime) throw new Error('The agent runtime is needed to validate memory.');
      const response = await runtime.request('/dextana/activity/memory/validate', {
        method: 'POST', body: JSON.stringify({ settings, apiKey: key, auth }), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('Could not validate the embedding connection. Try saving again.');
      const result = await response.json();
      if (Number.isInteger(result.embeddingDimensions) && result.embeddingDimensions > 0 && result.embeddingDimensions <= 16384) settings.embeddingDimensions = result.embeddingDimensions;
      else settings.memoryError = typeof result.memoryError === 'string' ? result.memoryError : 'Long-term memory is disabled. Could not use this embedding model. Check the model ID and connection, then save again.';
    }
    if (settings.provider !== 'openai') return settings;
    const current = this.current();
    const metadata = { hasApiKey: !!key, authMode: auth.mode, hasCustomAuth: !!Object.keys(auth.headers).length || !!Object.keys(auth.body).length };
    if (apiKey === undefined && authInput === undefined && current.connectionId && current.provider === settings.provider && endpoint(current.ollamaUrl) === settings.ollamaUrl) return { ...settings, connectionId: current.connectionId, ...metadata };
    const id = randomUUID();
    const connection: Connection = { id, provider: 'openai', base: settings.ollamaUrl, apiKey: key, auth };
    // Even keyless connections are encrypted so their storage format stays consistent.
    this.encryption();
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(join(this.directory, id), safeStorage.encryptString(JSON.stringify(connection)), { mode: 0o600, flag: 'wx' });
    return { ...settings, connectionId: id, ...metadata };
  }
  async sync(runtime: Runtime) {
    const entries = await readdir(this.directory).catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
    const connections = await Promise.all(entries.filter(id => validId.test(id)).map(id => this.read(id)));
    const response = await runtime.request('/dextana/activity/model-connections', { method: 'POST', body: JSON.stringify({ connections }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Could not configure model connections in the backend.');
  }
}
