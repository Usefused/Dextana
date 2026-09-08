import { describe, expect, it } from 'vitest';
import { endpoint, settingsFrom } from '../../src/main/settings';
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
  it('rejects a model that was not discovered', () => {
    expect(() =>
      settingsFrom({ ollamaUrl: 'http://localhost:11434', models: ['a'], defaultModel: 'b' }),
    ).toThrow('Choose an available model');
  });
});
