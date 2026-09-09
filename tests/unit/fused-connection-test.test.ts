import { beforeEach, expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {} }));
vi.mock('../../src/main/backend-mcp', () => ({ backendMCP: vi.fn() }));
import { backendMCP } from '../../src/main/backend-mcp';
import { MCPConnections, toolFingerprint } from '../../src/main/mcp';
import { Store } from '../../src/main/store';
import type { Runtime } from '../../src/main/runtime';

beforeEach(() => vi.mocked(backendMCP).mockReset());
function fixture() {
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const server = { id: 'version', mcpId: 'family', name: 'Fused', version: '1', url: 'https://engine.example/mcp' };
  const tool = { name: 'read', description: 'Read', inputSchema: { type: 'object' as const } };
  store.state.fusedWorkspace = { url: 'https://engine.example', connectedAt: 'original', servers: [server] };
  store.state.mcpConnections = [{ id: 'connection', name: 'Fused', enabled: true, transport: 'http', url: server.url, command: '', args: [], revision: 'original', tools: [{ ...tool, fingerprint: toolFingerprint(tool), policy: 'ask' }], fusedNative: { engine: 'https://engine.example', server, autoToken: true, operations: ['tasks.read'] } }];
  const token = { token: 'synthetic-test-token', name: 'temporary', engine: 'https://engine.example', mcpId: 'family', expiresAt: Date.now() + 86400000 };
  const issuer = { issue: vi.fn().mockResolvedValue(token), revoke: vi.fn().mockResolvedValue(undefined) };
  const client = { listTools: vi.fn().mockResolvedValue({ tools: [tool] }), close: vi.fn().mockResolvedValue(undefined), callTool: vi.fn() };
  vi.mocked(backendMCP).mockResolvedValue(client as any);
  return { store, issuer, client, token, mcp: new MCPConnections(store, '/unused', () => {}, issuer, {} as Runtime) };
}

test('owner settings test discovers tools with a temporary scoped token and leaves agent approval intact', async () => {
  const { mcp, issuer, client, token, store } = fixture();
  await mcp.test('connection');
  expect(issuer.issue).toHaveBeenCalledWith('https://engine.example', 'family', ['tasks.read'], expect.any(AbortSignal));
  expect(client.callTool).not.toHaveBeenCalled();
  expect(client.close).toHaveBeenCalledOnce();
  expect(issuer.revoke).toHaveBeenCalledWith(token);
  expect(store.state.mcpConnections![0].tools[0].policy).toBe('ask');
  expect(JSON.stringify(store.state)).not.toContain(token.token);
  expect(mcp.prepare('chat', 'call', 'connection', 'connect', '{}').requiresApproval).toBe(true);
});

test.each(['open', 'discovery', 'close'])('temporary token is revoked when %s fails', async stage => {
  const { mcp, issuer, client, token } = fixture();
  if (stage === 'open') vi.mocked(backendMCP).mockRejectedValueOnce(new Error('open failed'));
  if (stage === 'discovery') client.listTools.mockRejectedValueOnce(new Error('discovery failed'));
  if (stage === 'close') client.close.mockRejectedValueOnce(new Error('close failed'));
  await expect(mcp.test('connection')).rejects.toThrow('failed');
  expect(issuer.revoke).toHaveBeenCalledWith(token);
  expect(issuer.issue).toHaveBeenCalledOnce();
});

test('a workspace change during issuance prevents the network test and still cleans up', async () => {
  const { mcp, issuer, token, store } = fixture();
  issuer.issue.mockImplementationOnce(async () => { store.state.fusedWorkspace!.connectedAt = 'different'; return token; });
  await expect(mcp.test('connection')).rejects.toThrow('workspace changed');
  expect(backendMCP).not.toHaveBeenCalled();
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
