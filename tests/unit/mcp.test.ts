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
