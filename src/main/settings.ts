import { isChatModel, isEmbeddingModel, isVisionModel } from '../shared/chat-models';
import type { ModelCatalog, Settings } from '../shared/types';
import { defaultModelAuth, modelHeaders, type ModelAuth } from '../shared/model-auth';
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
  if (value.embeddingModel !== undefined && (typeof value.embeddingModel !== 'string' || value.embeddingModel.length > 200)) throw new Error('Enter an embedding model ID up to 200 characters.');
  if (value.imageInterpreterModel !== undefined && (typeof value.imageInterpreterModel !== 'string' || value.imageInterpreterModel.length > 200)) throw new Error('Enter an image interpreter model ID up to 200 characters.');
  if (value.imageInterpreterModel?.trim() && isEmbeddingModel({ id: value.imageInterpreterModel.trim() })) throw new Error('Choose an image interpreter, not an embedding model.');
  return {
    ...(value.provider ? { provider: value.provider } : {}),
    ollamaUrl: endpoint(value.ollamaUrl),
    models: [...new Set(value.models)],
    ...(value.embeddingModel?.trim() ? { embeddingModel: value.embeddingModel.trim() } : {}),
    ...(value.imageInterpreterModel?.trim() ? { imageInterpreterModel: value.imageInterpreterModel.trim() } : {}),
  };
}
export async function getModels(value: unknown): Promise<string[]> {
  return (await getModelCatalog(value)).chat;
}
export async function getModelCatalog(value: unknown): Promise<ModelCatalog> {
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
      return { name: model.name, capabilities: Array.isArray(capabilities) ? capabilities : [] };
    }));
    const names = (capability: string) => [...new Set(supported.filter(model => model.capabilities.includes(capability)).map(model => model.name))];
    return { chat: names('completion'), embedding: names('embedding'), vision: names('vision') };
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
  return (await getCompatibleModelCatalog(value, apiKey)).chat;
}
export async function getCompatibleModelCatalog(value: unknown, apiKey = '', auth: ModelAuth = defaultModelAuth()): Promise<ModelCatalog> {
  const data = await compatibleModelDetails(value, apiKey, auth);
  const ids = (predicate: typeof isChatModel) => [...new Set<string>(data.filter(predicate).map((m: { id: string }) => m.id))];
  return { chat: ids(isChatModel), embedding: ids(isEmbeddingModel), vision: ids(isVisionModel) };
}

export async function compatibleModelDetails(value: unknown, apiKey = '', auth: ModelAuth = defaultModelAuth()): Promise<({ id: string } & Record<string, any>)[]> {
  const url = endpoint(value);
  // OpenRouter defaults to text-only; request both catalogs in the same call.
  // https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
  const modelsUrl = `${url}/models${new URL(url).hostname === 'openrouter.ai' ? '?output_modalities=text,embeddings' : ''}`;
  let response: Response;
  try {
    response = await fetch(modelsUrl, { headers: modelHeaders(apiKey, auth), signal: AbortSignal.timeout(10_000), redirect: 'error' });
  } catch { throw new Error('Could not connect. Check the base URL and your connection.'); }
  if (!response.ok) throw new Error(`Model endpoint returned HTTP ${response.status}. Check the URL and API key.`);
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body?.data) || body.data.some((m: any) => typeof m?.id !== 'string' || !m.id.trim() || m.id.length > 200)) throw new Error('This endpoint did not return a model list. Enter a model ID manually.');
  return body.data;
}
