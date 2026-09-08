import { test, expect, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {} }));
import { fusedEnvironment, parseFusedServers } from '../../src/main/fused-cli';
test('isolates CLI configuration and removes ambient Fused credentials', () => {
  vi.stubEnv('FUSED_API_KEY', 'ambient');
  vi.stubEnv('FUSED_LICENSE_KEY', 'ambient');
  vi.stubEnv('FUSED_ENGINE_URL', 'https://other.example');
  try {
    const env = fusedEnvironment('/private/dext/config');
    expect(env).toMatchObject({ XDG_CONFIG_HOME: '/private/dext/config' });
    expect(env).not.toHaveProperty('FUSED_API_KEY');
    expect(env).not.toHaveProperty('FUSED_LICENSE_KEY');
    expect(env).not.toHaveProperty('FUSED_ENGINE_URL');
  } finally {
    vi.unstubAllEnvs();
  }
});
test('discovery pins exact version URLs and rejects malformed or foreign endpoints', () => {
  const item = {
    status: 'active',
    app_family_id: 'family',
    app_id: 'v1',
    name: 'Mail',
    version: '1',
    transport_urls: { versioned_streamable_http: 'https://engine.example/mcp/v1/mcp' },
  };
  expect(
    parseFusedServers({ items: [item], total: 1 }, 'https://engine.example').servers[0],
  ).toMatchObject({ id: 'v1', mcpId: 'family', version: '1' });
  expect(() =>
    parseFusedServers(
      {
        items: [
          { ...item, transport_urls: { versioned_streamable_http: 'https://foreign.example/mcp' } },
        ],
        total: 1,
      },
      'https://engine.example',
    ),
  ).toThrow('outside');
  expect(() =>
    parseFusedServers({ items: [{ ...item, app_id: '' }], total: 1 }, 'https://engine.example'),
  ).toThrow('identity');
  expect(() => parseFusedServers({}, 'https://engine.example')).toThrow('JSON');
});

test('token JSON must match the approved MCP, exact allowlist and bounded expiry', async () => {
  const { parseFusedToken } = await import('../../src/main/fused-cli');
  const value = { id: 'id', app_family_id: 'mcp', name: 'dext-token', token: 'secret', allow: ['mail.send'], expires_at: new Date(Date.now() + 86400000).toISOString() };
  expect(parseFusedToken(value, 'mcp', 'dext-token', ['mail.send']).token).toBe('secret');
  for (const changed of [{ allow: ['*'] }, { app_family_id: 'other' }, { name: 'other' }, { expires_at: 'invalid' }, { expires_at: new Date(Date.now() + 90000000).toISOString() }, { token: '' }]) expect(() => parseFusedToken({ ...value, ...changed }, 'mcp', 'dext-token', ['mail.send'])).toThrow('Invalid Fused token');
});
