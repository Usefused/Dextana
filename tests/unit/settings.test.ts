import { describe, expect, it, vi } from 'vitest';
import { endpoint, settingsFrom, modelReasoning, getModelCatalog, getCompatibleModelCatalog } from '../../src/main/settings';
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
      expect(await getModelCatalog('http://localhost:11434')).toEqual({ chat: ['chat-model'], embedding: ['embeddinggemma:latest', 'renamed-vector-model'], vision: [] });
      expect(fetcher).toHaveBeenCalledTimes(3); // One tags call, one show per model missing capabilities.
    } finally { fetcher.mockRestore(); }
  });
  it('requires at least one discovered model', () => {
    expect(() =>
      settingsFrom({ ollamaUrl: 'http://localhost:11434', models: [] }),
    ).toThrow('Connect at least one available model');
  });
  it('keeps embedding configuration separate and discards unverified capability claims', () => {
    const base = { provider: 'openai' as const, ollamaUrl: 'https://gateway.example/v1', models: ['chat'] };
    expect(settingsFrom({ ...base, embeddingModel: ' vectors ', embeddingDimensions: 123, memoryError: 'untrusted' }))
      .toEqual({ ...base, embeddingModel: 'vectors' });
    expect(settingsFrom({ ...base, embeddingModel: ' ' })).toEqual(base);
    expect(() => settingsFrom({ ...base, embeddingModel: 'x'.repeat(201) })).toThrow('embedding model ID');
  });
  it('saves an optional image interpreter separately from chat and embeddings', () => {
    const base = { ollamaUrl: 'http://localhost:11434', models: ['chat'] };
    expect(settingsFrom({ ...base, imageInterpreterModel: ' vision ' })).toEqual({ ...base, imageInterpreterModel: 'vision' });
    expect(settingsFrom({ ...base, imageInterpreterModel: '' })).toEqual(base);
    expect(() => settingsFrom({ ...base, imageInterpreterModel: 'x'.repeat(201) })).toThrow('image interpreter model ID');
    expect(() => settingsFrom({ ...base, imageInterpreterModel: 'embeddinggemma' })).toThrow('image interpreter');
  });
  it('discovers image input capabilities without guessing from model names', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    try {
      fetcher.mockResolvedValueOnce(Response.json({ models: [
        { name: 'local-image-model', capabilities: ['completion', 'vision'] },
        { name: 'chat', capabilities: ['completion'] },
      ] }));
      expect((await getModelCatalog('http://localhost:11434')).vision).toEqual(['local-image-model']);
      fetcher.mockResolvedValueOnce(Response.json({ data: [
        { id: 'multimodal', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
        { id: 'text-only' }, { id: 'image-generator', output_modalities: ['image'] },
      ] }));
      expect((await getCompatibleModelCatalog('https://gateway.example/v1')).vision).toEqual(['multimodal']);
    } finally { fetcher.mockRestore(); }
  });
});

it('filters compatible catalogs using task metadata, output modalities and embedding IDs', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: [
    { id: 'vendor/chat' }, { id: 'text-embedding-3-large' }, { id: 'BAAI/bge-m3' },
    { id: 'opaque', task: 'feature-extraction' }, { id: 'other', architecture: { output_modalities: ['embeddings'] } },
    { id: 'renamed', capabilities: ['embedding'] }, { id: 'vendor/reasoner', architecture: { output_modalities: ['text'] } },
    { id: 'BAAI/bge-reranker-v2-m3' }, { id: 'opaque-ranker', task: 'rerank' },
    { id: 'picture', output_modalities: ['image'] }, { id: 'voice', capabilities: ['audio'] },
    { id: 'BAAI/bge-m3' },
  ] }));
  try {
    expect(await getCompatibleModelCatalog('https://gateway.example/v1', 'fixture-key')).toEqual({ chat: ['vendor/chat', 'vendor/reasoner'], embedding: ['text-embedding-3-large', 'BAAI/bge-m3', 'opaque', 'other', 'renamed'], vision: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://gateway.example/v1/models', expect.objectContaining({ headers: { authorization: 'Bearer fixture-key' }, redirect: 'error' }));
    expect(() => settingsFrom({ provider: 'openai', ollamaUrl: 'https://gateway.example/v1', models: ['text-embedding-3-small'] })).toThrow('Choose a chat model');
  } finally { fetcher.mockRestore(); }
});

it('requests OpenRouter embedding and chat models together instead of its default text-only catalog', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: [
    { id: 'chat', architecture: { output_modalities: ['text'] } },
    { id: 'vectors', architecture: { output_modalities: ['embeddings'] } },
  ] }));
  try {
    expect(await getCompatibleModelCatalog('https://openrouter.ai/api/v1')).toEqual({ chat: ['chat'], embedding: ['vectors'], vision: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models?output_modalities=text,embeddings', expect.anything());
  } finally { fetcher.mockRestore(); }
});
