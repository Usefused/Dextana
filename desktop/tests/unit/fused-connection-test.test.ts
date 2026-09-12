import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {} }));
vi.mock('../../src/main/backend-mcp', () => ({ backendMCP: vi.fn() }));
import { UrlElicitationRequiredError } from '@modelcontextprotocol/sdk/types.js';
import { backendMCP } from '../../src/main/backend-mcp';
import { MCPConnections, toolFingerprint } from '../../src/main/mcp';
import { Store } from '../../src/main/store';
import type { Runtime } from '../../src/main/runtime';

beforeEach(() => vi.mocked(backendMCP).mockReset());
function fixture() {
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const server = {
    id: 'version',
    mcpId: 'family',
    name: 'Fused',
    version: '1',
    url: 'https://engine.example/mcp',
  };
  const tool = { name: 'read', description: 'Read', inputSchema: { type: 'object' as const } };
  store.state.dextIdentityRef = 'dextana-11111111-1111-4111-8111-111111111111';
  store.state.fusedWorkspace = {
    url: 'https://engine.example',
    connectedAt: 'original',
    servers: [server],
  };
  store.state.mcpConnections = [
    {
      id: 'connection',
      name: 'Fused',
      enabled: true,
      transport: 'http',
      url: server.url,
      command: '',
      args: [],
      revision: 'original',
      tools: [{ ...tool, fingerprint: toolFingerprint(tool), policy: 'ask' }],
      fusedNative: {
        engine: 'https://engine.example',
        server,
        autoToken: true,
        operations: ['tasks.read'],
      },
    },
  ];
  const token = {
    token: 'synthetic-test-token',
    name: 'temporary',
    engine: 'https://engine.example',
    mcpId: 'family',
    expiresAt: Date.now() + 86400000,
  };
  const issuer = {
    issue: vi.fn().mockResolvedValue(token),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const client = {
    listTools: vi.fn().mockResolvedValue({ tools: [tool] }),
    close: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn(),
  };
  vi.mocked(backendMCP).mockResolvedValue(client as any);
  const openNative = vi.fn().mockResolvedValue(client as any);
  return {
    store,
    issuer,
    client,
    token,
    openNative,
    mcp: new MCPConnections(store, '/unused', () => {}, issuer, {} as Runtime, openNative),
  };
}

const authenticationId = '11111111-1111-4111-8111-111111111111';
function authenticationError(retryAllowed = true) {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  return new UrlElicitationRequiredError([
    {
      mode: 'url',
      elicitationId: authenticationId,
      url: 'https://engine.example/connect/opaque',
      message: 'Connect your provider account to continue.',
      _meta: {
        'com.usefused/auth': {
          schema_version: 1,
          action: 'connect',
          expires_at: expiresAt,
          recovery_action: 'complete_authentication',
          execute_request: retryAllowed ? 'retry_after_auth' : 'do_not_replay',
          provider_execution: retryAllowed ? 'not_started' : 'unknown',
        },
      },
    },
  ]);
}

function addLiveToken(work: ReturnType<typeof fixture>, activityId = 'chat') {
  const connection = work.store.state.mcpConnections![0];
  (work.mcp as any).tokens.set(`${connection.id}:${activityId}`, {
    value: work.token,
    scope: (work.mcp as any).nativeScope(connection),
  });
}

test('owner settings test discovers tools with a temporary scoped token and leaves agent approval intact', async () => {
  const { mcp, issuer, client, token, store } = fixture();
  await mcp.test('connection');
  expect(issuer.issue).toHaveBeenCalledWith(
    'https://engine.example',
    'family',
    ['tasks.read'],
    expect.any(AbortSignal),
  );
  expect(client.callTool).not.toHaveBeenCalled();
  expect(client.close).toHaveBeenCalledOnce();
  expect(issuer.revoke).toHaveBeenCalledWith(token);
  expect(store.state.mcpConnections![0].tools[0].policy).toBe('ask');
  expect(JSON.stringify(store.state)).not.toContain(token.token);
  expect(mcp.prepare('chat', 'call', 'connection', 'read', '{}').requiresApproval).toBe(true);
});

test('safe provider authentication closes its prompt and resumes the exact pending MCP call', async () => {
  const work = fixture();
  addLiveToken(work);
  const result = { content: [{ type: 'text', text: 'finished' }] };
  work.client.callTool.mockRejectedValueOnce(authenticationError()).mockResolvedValueOnce(result);
  const prepared = work.mcp.prepare('chat', 'call', 'connection', 'read', '{"list":"mine"}');
  work.mcp.grant('chat', 'call');

  const execution = work.mcp.execute('chat', 'call', prepared.ticket, new AbortController().signal);
  await vi.waitFor(() =>
    expect(work.store.state.mcpAuthentications?.[0]).toMatchObject({
      id: authenticationId,
      state: 'waiting',
      retryAllowed: true,
    }),
  );
  expect(work.client.callTool).toHaveBeenCalledOnce();

  work.openNative.mock.calls[0][0].onAuthenticationComplete(authenticationId);

  await expect(execution).resolves.toEqual(result);
  expect(work.store.state.mcpAuthentications).toEqual([]);
  expect(work.client.callTool).toHaveBeenCalledTimes(2);
  expect(work.client.callTool.mock.calls[1][0]).toEqual(work.client.callTool.mock.calls[0][0]);
  work.openNative.mock.calls[0][0].onAuthenticationComplete(authenticationId);
  expect(work.client.callTool).toHaveBeenCalledTimes(2);
});

test('authentication cancellation ends the pending call without replaying it', async () => {
  const work = fixture();
  addLiveToken(work);
  work.client.callTool.mockRejectedValueOnce(authenticationError());
  const prepared = work.mcp.prepare('chat', 'call', 'connection', 'read', '{}');
  work.mcp.grant('chat', 'call');
  const execution = work.mcp.execute('chat', 'call', prepared.ticket, new AbortController().signal);
  await vi.waitFor(() => expect(work.store.state.mcpAuthentications).toHaveLength(1));

  work.mcp.dismissAuthentication(authenticationId);

  await expect(execution).rejects.toThrow('cancelled');
  expect(work.store.state.mcpAuthentications).toEqual([]);
  expect(work.client.callTool).toHaveBeenCalledOnce();
});

test('an ambiguous provider outcome is never replayed after authentication completes', async () => {
  const work = fixture();
  addLiveToken(work);
  work.client.callTool.mockRejectedValueOnce(authenticationError(false));
  const prepared = work.mcp.prepare('chat', 'call', 'connection', 'read', '{}');
  work.mcp.grant('chat', 'call');

  await expect(
    work.mcp.execute('chat', 'call', prepared.ticket, new AbortController().signal),
  ).rejects.toThrow('must not be replayed automatically');
  expect(work.store.state.mcpAuthentications?.[0]).toMatchObject({
    state: 'waiting',
    retryAllowed: false,
  });

  work.openNative.mock.calls[0][0].onAuthenticationComplete(authenticationId);

  expect(work.store.state.mcpAuthentications?.[0].state).toBe('complete');
  expect(work.client.callTool).toHaveBeenCalledOnce();
});

test.each(['open', 'discovery', 'close'])(
  'temporary token is revoked when %s fails',
  async (stage) => {
    const { mcp, issuer, client, token, openNative } = fixture();
    if (stage === 'open') openNative.mockRejectedValueOnce(new Error('open failed'));
    if (stage === 'discovery')
      client.listTools.mockRejectedValueOnce(new Error('discovery failed'));
    if (stage === 'close') client.close.mockRejectedValueOnce(new Error('close failed'));
    await expect(mcp.test('connection')).rejects.toThrow('failed');
    expect(issuer.revoke).toHaveBeenCalledWith(token);
    expect(issuer.issue).toHaveBeenCalledOnce();
  },
);

test('a workspace change during issuance prevents the network test and still cleans up', async () => {
  const { mcp, issuer, token, store, openNative } = fixture();
  issuer.issue.mockImplementationOnce(async () => {
    store.state.fusedWorkspace!.connectedAt = 'different';
    return token;
  });
  await expect(mcp.test('connection')).rejects.toThrow('workspace changed');
  expect(openNative).not.toHaveBeenCalled();
  expect(issuer.revoke).toHaveBeenCalledWith(token);
});

test('a disconnected workspace cannot issue a test token', async () => {
  const { mcp, issuer, store } = fixture();
  delete store.state.fusedWorkspace;
  await expect(mcp.test('connection')).rejects.toThrow('Reconnect');
  expect(issuer.issue).not.toHaveBeenCalled();
});

test('manual testing does not require automatic agent token creation to be enabled', async () => {
  const { mcp, store, issuer } = fixture();
  store.state.mcpConnections![0].fusedNative!.autoToken = false;
  await mcp.test('connection');
  expect(issuer.issue).toHaveBeenCalledOnce();
  expect(issuer.revoke).toHaveBeenCalledOnce();
});

test('adding an MCP discovers real tools with optional operation restrictions before saving', async () => {
  const { mcp, store, issuer, client } = fixture();
  store.state.mcpConnections = [];
  await mcp.selectFused('version', true, []);
  expect(issuer.issue).toHaveBeenCalledWith(
    'https://engine.example',
    'family',
    [],
    expect.any(AbortSignal),
  );
  expect(issuer.revoke).toHaveBeenCalledOnce();
  expect(client.callTool).not.toHaveBeenCalled();
  const connection = store.state.mcpConnections[0];
  expect(connection.testedAt).toBeTruthy();
  expect(connection.tools.map((tool) => tool.name)).toEqual(['read']);
  await mcp.setTools(connection.id, { read: 'ask' });
  expect(mcp.catalog('new-chat')[0].tools.map((tool) => tool.name)).toEqual(['read']);
  expect(() => mcp.prepare('chat', 'legacy', connection.id, 'connect', '{}')).toThrow(
    'not enabled',
  );
  expect(
    mcp.prepare('chat', 'read', connection.id, 'read', '{}').arguments.token?.operations,
  ).toEqual(['*']);
});

test('new native Fused connections enable documentation search and ask before execution', async () => {
  const { mcp, store, client } = fixture();
  store.state.mcpConnections = [];
  client.listTools.mockResolvedValueOnce({
    tools: [
      { name: 'search_docs', description: 'Search documentation', inputSchema: { type: 'object' } },
      { name: 'execute', description: 'Execute an operation', inputSchema: { type: 'object' } },
      { name: 'admin', description: 'Administrative action', inputSchema: { type: 'object' } },
    ],
  });

  await mcp.selectFused('version', true, []);

  const connection = store.state.mcpConnections![0];
  expect(Object.fromEntries(connection.tools.map((tool) => [tool.name, tool.policy]))).toEqual({
    search_docs: 'auto',
    execute: 'ask',
    admin: 'disabled',
  });
  expect(mcp.catalog()[0].tools.map((tool) => tool.name)).toEqual(['search_docs', 'execute']);
});

test('retesting a native Fused connection preserves user-selected tool policies', async () => {
  const { mcp, store, client } = fixture();
  const connection = store.state.mcpConnections![0];
  connection.tools = [
    {
      name: 'search_docs',
      description: 'Search documentation',
      inputSchema: { type: 'object' },
      fingerprint: toolFingerprint({
        name: 'search_docs',
        description: 'Search documentation',
        inputSchema: { type: 'object' },
      }),
      policy: 'ask',
    },
    {
      name: 'execute',
      description: 'Execute an operation',
      inputSchema: { type: 'object' },
      fingerprint: toolFingerprint({
        name: 'execute',
        description: 'Execute an operation',
        inputSchema: { type: 'object' },
      }),
      policy: 'disabled',
    },
  ];
  client.listTools.mockResolvedValueOnce({
    tools: connection.tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    })),
  });

  await mcp.test(connection.id);

  expect(
    Object.fromEntries(
      store.state.mcpConnections![0].tools.map((tool) => [tool.name, tool.policy]),
    ),
  ).toEqual({
    search_docs: 'ask',
    execute: 'disabled',
  });
});

test('failed add preserves the existing connection and revokes the setup token', async () => {
  const { mcp, store, issuer, client } = fixture();
  const before = JSON.stringify(store.state.mcpConnections);
  client.listTools.mockRejectedValueOnce(new Error('discovery failed'));
  await expect(mcp.selectFused('version', true, [])).rejects.toThrow('discovery failed');
  expect(JSON.stringify(store.state.mcpConnections)).toBe(before);
  expect(issuer.revoke).toHaveBeenCalledOnce();
});

test('the obsolete synthetic connect tool is hidden, but a server-owned connect tool works', () => {
  const { mcp, store } = fixture();
  const tools = store.state.mcpConnections![0].tools;
  tools[0].name = 'connect';
  expect(mcp.catalog()[0].tools[0].name).toBe('connect');
  expect(mcp.prepare('chat', 'real', 'connection', 'connect', '{}').requiresApproval).toBe(true);
  tools[0].fingerprint = 'fused-native-connect-v1';
  expect(mcp.catalog()).toEqual([]);
  expect(() => mcp.prepare('chat', 'legacy', 'connection', 'connect', '{}')).toThrow('not enabled');
});
