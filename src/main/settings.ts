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
  if (!value.models.includes(value.defaultModel)) throw new Error('Choose an available model.');
  return {
    ollamaUrl: endpoint(value.ollamaUrl),
    defaultModel: value.defaultModel,
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
    const body = (await response.json()) as { models?: { name: string }[] };
    if (!Array.isArray(body.models) || body.models.some((m) => typeof m.name !== 'string'))
      throw new Error('Unexpected Ollama model list.');
    return body.models.map((m) => m.name);
  } catch (error) {
    throw new Error(
      `Could not connect to Ollama. Check that it is running and the address is correct. ${(error as Error).message}`,
    );
  }
}
