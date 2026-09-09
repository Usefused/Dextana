import { afterEach, expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {} }));
import { ModelConnections } from '../../src/main/model-connections';

afterEach(() => vi.restoreAllMocks());
test('OpenRouter rejects bad credentials before accepting its public model catalog', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({}, { status: 401 }));
  const settings = {
    provider: 'openai' as const,
    ollamaUrl: 'https://openrouter.ai/api/v1',
    models: ['model'],
  };
  const connections = new ModelConnections('/tmp/unused-auth-test', () => settings);
  await expect(connections.modelCatalog(settings, 'invalid-fixture-key')).rejects.toThrow(
    'OpenRouter did not accept',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    'https://openrouter.ai/api/v1/key',
    expect.objectContaining({ headers: { authorization: 'Bearer invalid-fixture-key' } }),
  );
  await expect(connections.save(settings, 'invalid-fixture-key')).rejects.toThrow(
    'OpenRouter did not accept',
  );
});
