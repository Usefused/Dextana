import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('electron', () => ({ safeStorage: {} }));
import {
  FusedCLI,
  fusedEnvironment,
  parseFusedServers,
  parseFusedOperations,
} from '../../src/main/fused-cli';
import { Store } from '../../src/main/store';
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
  const server = parseFusedServers({ items: [item], total: 1 }, 'https://engine.example')
    .servers[0];
  const catalog = {
    version_id: 'v1',
    mcp_id: 'family',
    total: 2,
    operations: [{ operation_id: 'mail.send' }, { operation_id: 'mail.read' }],
  };
  expect(parseFusedOperations(catalog, server)).toEqual(['mail.read', 'mail.send']);
  expect(() => parseFusedOperations({ ...catalog, version_id: 'other' }, server)).toThrow('verify');
  expect(() => parseFusedOperations({ ...catalog, total: 3 }, server)).toThrow('complete');
  expect(() =>
    parseFusedOperations(
      { ...catalog, operations: [{ operation_id: '*' }, { operation_id: 'mail.read' }] },
      server,
    ),
  ).toThrow('invalid');
});

test('token JSON must match the approved MCP, exact allowlist and bounded expiry', async () => {
  const { parseFusedToken } = await import('../../src/main/fused-cli');
  const value = {
    id: 'id',
    app_family_id: 'mcp',
    name: 'dext-token',
    token: 'secret',
    allow: ['mail.send'],
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };
  expect(parseFusedToken(value, 'mcp', 'dext-token', ['mail.send']).token).toBe('secret');
  for (const changed of [
    { allow: ['*'] },
    { app_family_id: 'other' },
    { name: 'other' },
    { expires_at: 'invalid' },
    { expires_at: new Date(Date.now() + 90000000).toISOString() },
    { token: '' },
  ])
    expect(() =>
      parseFusedToken({ ...value, ...changed }, 'mcp', 'dext-token', ['mail.send']),
    ).toThrow('Invalid Fused token');
});

test('omitting operation restrictions validates the CLI default all-operations token', async () => {
  const { parseFusedToken } = await import('../../src/main/fused-cli');
  const value = {
    id: 'id',
    app_family_id: 'mcp',
    name: 'dext-token',
    token: 'secret',
    allow: ['*'],
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  };
  expect(parseFusedToken(value, 'mcp', 'dext-token', []).token).toBe('secret');
  expect(() => parseFusedToken({ ...value, allow: [] }, 'mcp', 'dext-token', [])).toThrow(
    'Invalid Fused token',
  );
});

test('migrates one stable Dext identity outside the reconnectable Fused workspace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-identity-'));
  try {
    const store = new Store(directory);
    await store.load();
    const legacy = 'dextana-11111111-1111-4111-8111-111111111111';
    store.state.fusedWorkspace = {
      url: 'https://engine.example',
      connectedAt: 'now',
      userRef: legacy,
      servers: [],
    };
    await new FusedCLI(store, directory, () => {}).initialize();
    expect(store.state.dextIdentityRef).toBe(legacy);
    expect(store.state.fusedWorkspace.userRef).toBeUndefined();
    delete store.state.fusedWorkspace;
    await new FusedCLI(store, directory, () => {}).initialize();
    expect(store.state.dextIdentityRef).toBe(legacy);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
