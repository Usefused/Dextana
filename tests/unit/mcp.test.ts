import { expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ safeStorage: {} }));
import { MCPConnections, toolFingerprint } from '../../src/main/mcp';
import { Store } from '../../src/main/store';
import type { MCPToolPolicy } from '../../src/shared/types';

function setup(policy: MCPToolPolicy) {
  const store = new Store('/unused');
  const tool = {
    name: 'change',
    description: 'Change a task',
    inputSchema: { type: 'object' as const, properties: {} },
  };
  store.state.mcpConnections = [
    {
      id: 'server',
      name: 'Tasks',
      transport: 'http',
      url: 'https://example.com/mcp',
      command: '',
      args: [],
      enabled: true,
      revision: 'one',
      tools: [{ ...tool, fingerprint: toolFingerprint(tool), policy }],
    },
  ];
  vi.spyOn(store, 'save').mockResolvedValue();
  return { store, mcp: new MCPConnections(store, '/unused', () => {}) };
}
test('disabled tools are absent from discovery and cannot prepare an execution', () => {
  const { mcp } = setup('disabled');
  expect(mcp.catalog()).toEqual([]);
  expect(() => mcp.prepare('chat', 'call', 'server', 'change', '{}')).toThrow('not enabled');
});
test('a pending tool cannot execute without a grant or from a different chat or call', async () => {
  const { mcp } = setup('ask');
  const plan = mcp.prepare('chat', 'call', 'server', 'change', '{}');
  expect(plan.requiresApproval).toBe(true);
  await expect(
    mcp.execute('chat', 'call', plan.ticket, new AbortController().signal),
  ).rejects.toThrow('exact approved');
  await expect(
    mcp.execute('other-chat', 'call', plan.ticket, new AbortController().signal),
  ).rejects.toThrow('No matching');
  await expect(
    mcp.execute('chat', 'other-call', plan.ticket, new AbortController().signal),
  ).rejects.toThrow('No matching');
  mcp.release('chat');
  expect(() => mcp.grant('chat', 'call')).toThrow('No matching');
});
test('policy changes invalidate prepared actions before network I/O and tickets cannot replay', async () => {
  const { mcp } = setup('auto');
  const plan = mcp.prepare('chat', 'call', 'server', 'change', '{}');
  await mcp.setTools('server', { change: 'disabled' });
  await expect(
    mcp.execute('chat', 'call', plan.ticket, new AbortController().signal),
  ).rejects.toThrow('permissions changed');
  await expect(
    mcp.execute('chat', 'call', plan.ticket, new AbortController().signal),
  ).rejects.toThrow('No matching');
});
test('unknown tool permissions cannot silently enable undiscovered tools', async () => {
  const { mcp } = setup('disabled');
  await expect(mcp.setTools('server', { invented: 'auto' })).rejects.toThrow(
    'each discovered tool',
  );
});

test('native Fused token access always needs exact approval and fails closed without its token service', async () => {
  const { store, mcp } = setup('auto');
  store.state.fusedWorkspace = { url: 'https://engine.example', connectedAt: 'now', servers: [{ id: 'v1', mcpId: 'family', name: 'Mail', version: '1', url: 'https://engine.example/mcp/v1/mcp' }] };
  await expect(mcp.selectFused('v1', true, ['*'])).rejects.toThrow('wildcards');
  await mcp.selectFused('v1', true, ['mail.send']);
  const connection = store.state.mcpConnections!.find(c => c.fusedNative)!;
  connection.tools[0].policy = 'auto';
  const plan = mcp.prepare('chat', 'call', connection.id, 'connect', '{}');
  expect(plan.requiresApproval).toBe(true);
  await expect(mcp.execute('chat', 'call', plan.ticket, new AbortController().signal)).rejects.toThrow('exact approved');
  mcp.grant('chat', 'call');
  await expect(mcp.execute('chat', 'call', plan.ticket, new AbortController().signal)).rejects.toThrow('No token was created');
  expect(() => mcp.grant('chat', 'call')).toThrow('No matching');
  delete store.state.fusedWorkspace;
  expect(mcp.catalog().find(c => c.id === connection.id)).toBeUndefined();
});

test('session-wide permission allows enabled MCP tools but revocation invalidates pending automatic calls', async () => {
  const { store, mcp } = setup('ask');
  store.state.activities.push({ id: 'chat', allowAllApprovals: true } as any);
  const plan = mcp.prepare('chat', 'call', 'server', 'change', '{}');
  expect(plan.requiresApproval).toBe(false);
  store.state.activities[0].allowAllApprovals = false;
  await expect(mcp.execute('chat', 'call', plan.ticket, new AbortController().signal)).rejects.toThrow('Session approval setting changed');
});

test('native Fused tokens are chat-specific and expiry restores connection approval', async () => {
  const { store, mcp } = setup('ask');
  store.state.fusedWorkspace = { url: 'https://engine.example', connectedAt: 'now', servers: [{ id: 'v1', mcpId: 'family', name: 'Mail', version: '1', url: 'https://engine.example/mcp/v1/mcp' }] };
  await mcp.selectFused('v1', true, ['mail.send']);
  const connection = store.state.mcpConnections!.find(c => c.fusedNative)!;
  connection.tools = [{ name: 'mail', description: 'Mail', inputSchema: { type: 'object' }, policy: 'ask', fingerprint: 'one' }];
  const token = { token: 'private', name: 'test', mcpId: 'family', engine: 'https://engine.example', expiresAt: Date.now() + 10000 };
  (mcp as any).tokens.set(`${connection.id}:chat`, { value: token, scope: (mcp as any).nativeScope(connection) });
  expect(mcp.catalog('chat').find(c => c.id === connection.id)!.tools[0].name).toBe('mail');
  expect(mcp.catalog('another-chat').find(c => c.id === connection.id)!.tools[0].name).toBe('connect');
  token.expiresAt = Date.now() - 1;
  connection.tools[0].policy = 'auto';
  store.state.activities.push({ id: 'chat', allowAllApprovals: true } as any);
  expect(mcp.prepare('chat', 'call', connection.id, 'mail', '{}').requiresApproval).toBe(true);
  expect(mcp.catalog('another-chat').find(c => c.id === connection.id)!.tools.some(tool => tool.name === 'mail')).toBe(true);
  expect(mcp.catalog('chat').find(c => c.id === connection.id)!.tools[0].name).toBe('connect');
});
