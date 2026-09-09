import { describe, expect, it, vi } from 'vitest';
import { endpoint, settingsFrom, modelReasoning, getModels } from '../../src/main/settings';
describe('connection boundary', () => {
  it('permits local HTTP and remote HTTPS', () => {
    expect(endpoint('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(endpoint('https://models.example.com')).toBe('https://models.example.com');
  });
  it.each([
    'file:///etc/passwd',
    'http://remote.example.com',
    'https://user:pass@example.com',
    'https://example.com?token=secret',
  ])('rejects unsafe address %s', (url) => {
    expect(() => endpoint(url)).toThrow();
  });
  it('uses reported thinking capabilities and architecture for reasoning controls', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      fetcher.mockResolvedValueOnce(Response.json({ capabilities: ['completion'] }));
      expect(await modelReasoning('http://localhost:11434', 'plain')).toBe('none');
      fetcher.mockResolvedValueOnce(Response.json({ capabilities: ['thinking'] }));
      expect(await modelReasoning('http://localhost:11434', 'qwen3')).toBe('toggle');
      fetcher.mockResolvedValueOnce(Response.json({ capabilities: ['thinking'], model_info: { 'general.architecture': 'gptoss' } }));
      expect(await modelReasoning('http://localhost:11434', 'custom-name')).toBe('levels');
      fetcher.mockResolvedValueOnce(Response.json({ capabilities: ['thinking'], model_info: { 'general.architecture': 'deepseek4' } }));
      expect(await modelReasoning('http://localhost:11434', 'deepseek-v4-pro:cloud')).toBe('extended');
    } finally { fetcher.mockRestore(); }
  });
  it('excludes embedding-only models by capabilities, including renamed models and older tag responses', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      fetcher.mockResolvedValueOnce(Response.json({ models: [
        { name: 'embeddinggemma:latest', capabilities: ['embedding'] },
        { name: 'renamed-vector-model' },
        { name: 'chat-model' },
      ] }));
      fetcher.mockResolvedValueOnce(Response.json({ capabilities: ['embedding'] }));
      fetcher.mockResolvedValueOnce(Response.json({ capabilities: ['completion', 'tools'] }));
      expect(await getModels('http://localhost:11434')).toEqual(['chat-model']);
    } finally { fetcher.mockRestore(); }
  });
  it('requires at least one discovered model', () => {
    expect(() =>
      settingsFrom({ ollamaUrl: 'http://localhost:11434', models: [] }),
    ).toThrow('Connect at least one available model');
  });
});

it('filters compatible catalogs using task metadata, output modalities and embedding IDs', async () => {
  const { getCompatibleModels } = await import('../../src/main/settings');
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: [
    { id: 'vendor/chat' }, { id: 'text-embedding-3-large' }, { id: 'BAAI/bge-m3' },
    { id: 'opaque', task: 'feature-extraction' }, { id: 'other', architecture: { output_modalities: ['embeddings'] } },
    { id: 'renamed', capabilities: ['embedding'] }, { id: 'vendor/reasoner', architecture: { output_modalities: ['text'] } },
  ] }));
  try {
    expect(await getCompatibleModels('https://gateway.example/v1', 'fixture-key')).toEqual(['vendor/chat', 'vendor/reasoner']);
    expect(fetcher).toHaveBeenCalledWith('https://gateway.example/v1/models', expect.objectContaining({ headers: { Authorization: 'Bearer fixture-key' }, redirect: 'error' }));
    expect(() => settingsFrom({ provider: 'openai', ollamaUrl: 'https://gateway.example/v1', models: ['text-embedding-3-small'] })).toThrow('Choose a chat model');
  } finally { fetcher.mockRestore(); }
});
