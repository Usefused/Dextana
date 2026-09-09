import { isChatModel } from '../shared/chat-models';
import type { Settings } from '../shared/types';
export function endpoint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a valid HTTP address.');
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use an HTTP or HTTPS address without credentials, query, or fragment.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Remote connections require HTTPS.');
  return url.href.replace(/\/$/, '');
}
export function settingsFrom(value: Settings): Settings {
  if (
    !value ||
    !Array.isArray(value.models) ||
    value.models.some((m) => typeof m !== 'string' || !m.trim() || m.length > 200)
  )
    throw new Error('Invalid model list.');
  if (value.models.some(id => !isChatModel({ id }))) throw new Error('Choose a chat model. Embedding and reranking models are not supported.');
  if (!value.models.length) throw new Error('Connect at least one available model.');
  if (value.provider !== undefined && !['ollama', 'openai'].includes(value.provider)) throw new Error('Choose a model provider.');
  return {
    ...(value.provider ? { provider: value.provider } : {}),
    ollamaUrl: endpoint(value.ollamaUrl),
    models: [...new Set(value.models)],
  };
}
export async function getModels(value: unknown): Promise<string[]> {
  const url = endpoint(value);
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
    const body = (await response.json()) as { models?: { name: string; capabilities?: string[] }[] };
    if (!Array.isArray(body.models) || body.models.some((m) => typeof m.name !== 'string'))
      throw new Error('Unexpected Ollama model list.');
    const supported = await Promise.all(body.models.map(async model => {
      let capabilities = model.capabilities;
      if (!Array.isArray(capabilities)) {
        const details = await fetch(`${url}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.name }), signal: AbortSignal.timeout(10_000), redirect: 'error' });
        if (!details.ok) throw new Error(`Could not check capabilities for ${model.name}.`);
        capabilities = (await details.json()).capabilities;
      }
      return Array.isArray(capabilities) && capabilities.includes('completion') ? model.name : undefined;
    }));
    return [...new Set(supported.filter((name): name is string => name !== undefined))];
  } catch (error) {
    throw new Error(
      `Could not connect to Ollama. Check that it is running and the address is correct. ${(error as Error).message}`,
    );
  }
}

export async function modelReasoning(value: unknown, model: unknown): Promise<'none' | 'toggle' | 'levels' | 'extended'> {
  const url = endpoint(value);
  if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new Error('Choose a model.');
  const response = await fetch(`${url}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(10_000), redirect: 'error' });
  if (!response.ok) throw new Error('Could not check reasoning support.');
  const data = await response.json();
  if (!Array.isArray(data.capabilities) || !data.capabilities.includes('thinking')) return 'none';
  if (model.startsWith('deepseek-v4') || data.model_info?.['general.architecture'] === 'deepseek4') return 'extended';
  return model.startsWith('gpt-oss') || data.model_info?.['general.architecture'] === 'gptoss' ? 'levels' : 'toggle';
}

export async function getCompatibleModels(value: unknown, apiKey = ''): Promise<string[]> {
  const url = endpoint(value);
  let response: Response;
  try {
    response = await fetch(`${url}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.timeout(10_000), redirect: 'error' });
  } catch { throw new Error('Could not connect. Check the base URL and your connection.'); }
  if (!response.ok) throw new Error(`Model endpoint returned HTTP ${response.status}. Check the URL and API key.`);
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body?.data) || body.data.some((m: any) => typeof m?.id !== 'string' || !m.id.trim() || m.id.length > 200)) throw new Error('This endpoint did not return a model list. Enter a model ID manually.');
  return [...new Set<string>(body.data.filter(isChatModel).map((m: { id: string }) => m.id))];
}
