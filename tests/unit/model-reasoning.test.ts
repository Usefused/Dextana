import { expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {} }));
import { compatibleReasoning } from '../../src/shared/model-reasoning';
import { ModelConnections } from '../../src/main/model-connections';

test('OpenRouter uses reported efforts and hides Off for mandatory reasoning', () => {
  expect(compatibleReasoning({ reasoning: { supported_efforts: ['high', 'low', 'none'], mandatory: true } }, true))
    .toEqual({ kind: 'effort', choices: ['default', 'low', 'high'] });
  expect(compatibleReasoning({ reasoning: { supported_efforts: ['xhigh', 'minimal'], mandatory: false } }, true))
    .toEqual({ kind: 'effort', choices: ['default', 'off', 'minimal', 'xhigh'] });
  expect(compatibleReasoning({ reasoning: { supported_efforts: null } }, true))
    .toEqual({ kind: 'effort', choices: ['default', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] });
  expect(compatibleReasoning({ supported_parameters: ['reasoning'] }, true))
    .toEqual({ kind: 'effort', choices: ['default', 'low', 'medium', 'high'] });
  expect(compatibleReasoning({ id: 'plain', supported_parameters: [] }, true)).toBe('none');
  expect(compatibleReasoning({ id: 'opaque' }, false)).toBe('unknown');
  expect(compatibleReasoning(undefined, true)).toBe('unknown');
});

test('compatible discovery calls models, uses the configured auth, and refuses another endpoint', async () => {
  const saved = { provider: 'openai' as const, ollamaUrl: 'https://openrouter.ai/api/v1', models: ['vendor/model'] };
  const connections = new ModelConnections('/unused', () => saved);
  vi.spyOn(connections as any, 'key').mockResolvedValue('test-credential');
  vi.spyOn(connections as any, 'auth').mockResolvedValue({ mode: 'custom', headers: { 'x-key': 'test-credential', 'x-tenant': 'tenant' }, body: {} });
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [{ id: 'vendor/model', reasoning: { supported_efforts: ['high'], mandatory: true } }] }));
  try {
    expect(await connections.reasoning(saved.ollamaUrl, 'vendor/model')).toEqual({ kind: 'effort', choices: ['default', 'high'] });
    expect(fetcher.mock.calls[0][0]).toContain('/models');
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({ 'x-key': 'test-credential', 'x-tenant': 'tenant' });
    await expect(connections.reasoning('https://other.example/v1', 'vendor/model')).rejects.toThrow('connection changed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { fetcher.mockRestore(); }
});
