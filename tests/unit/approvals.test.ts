import { expect, test, vi } from 'vitest';
import { Activities } from '../../src/main/activities';
import { Store } from '../../src/main/store';
import type { Runtime } from '../../src/main/runtime';
import type { Browsers } from '../../src/main/browser';
import type { Fused } from '../../src/main/fused';

function setup(name = 'browser') {
  const store = new Store('/unused');
  store.state.settings.models = ['test'];
  store.state.fusedIntegrations = [{ id: 'integration', name: 'Fused', enabled: true, url: 'https://example.com/mcp', hasToken: true, revision: 'one' }];
  vi.spyOn(store, 'save').mockResolvedValue();
  const execute = vi.fn().mockResolvedValue({ done: true });
  const runtime = {
    ensure: async () => {},
    request: async () => Response.json({ id: 'session' }),
    stream: async (
      _session: string,
      _input: string,
      _meta: unknown,
      _signal: AbortSignal,
      _consume: unknown,
      tool: (value: unknown) => Promise<unknown>,
    ) => {
      await tool({
        name,
        arguments: { action: name === 'browser' ? 'read' : 'list', arguments_json: '{}' },
      });
      return { status: 'completed', outputText: 'Done' };
    },
  } as unknown as Runtime;
  const activities = new Activities(
    store,
    runtime,
    () => {},
    { execute, prepare: (_id: string, args: unknown) => args } as unknown as Browsers,
    { call: execute, resolve: () => store.state.fusedIntegrations![0] } as unknown as Fused,
  );
  async function start() {
    const id = await activities.start({ prompt: 'Test permission', model: 'test' });
    const activity = store.state.activities.find((item) => item.id === id)!;
    await vi.waitFor(() => expect(activity.approval).toBeDefined());
    return {
      activity,
      input: { activityId: id, approvalId: activity.approval!.id, approved: true },
    };
  }
  return { store, execute, activities, start };
}

test('approvals are bound to the exact chat and pending request and are consumed once', async () => {
  const { execute, activities, start } = setup();
  const { activity, input } = await start();
  expect(execute).not.toHaveBeenCalled();
  await expect(activities.approve({ ...input, activityId: 'different-chat' })).rejects.toThrow(
    'no longer pending',
  );
  expect(execute).not.toHaveBeenCalled();
  await activities.approve(input);
  await expect(activities.approve(input)).rejects.toThrow('no longer pending');
  await vi.waitFor(() => expect(activity.status).toBe('completed'));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(activity.permissions).toBeUndefined();
});

test('denying MCP access stops the turn before contacting the client', async () => {
  const { execute, activities, start } = setup('fused');
  const { activity, input } = await start();
  await activities.approve({ ...input, approved: false });
  await vi.waitFor(() => expect(activity.status).toBe('cancelled'));
  expect(execute).not.toHaveBeenCalled();
  expect(activity.approval).toBeUndefined();
});

test('a failed auto-allow save leaves the action pending and does not grant permission', async () => {
  const { store, execute, activities, start } = setup();
  const { activity, input } = await start();
  vi.mocked(store.save).mockRejectedValueOnce(new Error('Disk unavailable'));
  await expect(activities.approve({ ...input, autoAllow: true })).rejects.toThrow(
    'Disk unavailable',
  );
  expect(execute).not.toHaveBeenCalled();
  expect(activity.permissions).toBeUndefined();
  expect(activity.approval?.id).toBe(input.approvalId);
  await activities.cancel(activity.id);
  await expect(activities.approve(input)).rejects.toThrow('no longer pending');
});

test('cancelling while an auto-allow decision is being saved cannot dispatch the action', async () => {
  const { store, execute, activities, start } = setup();
  const { activity, input } = await start();
  let saved = () => {};
  vi.mocked(store.save).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  const decision = activities.approve({ ...input, autoAllow: true });
  const rejected = expect(decision).rejects.toThrow('cancelled');
  await expect(activities.approve(input)).rejects.toThrow('no longer pending');
  await activities.cancel(activity.id);
  saved();
  await rejected;
  expect(execute).not.toHaveBeenCalled();
  expect(activity.approval).toBeUndefined();
});

test('delegated workers ask independently instead of inheriting parent auto-allow', async () => {
  const { store, activities, start } = setup();
  const { activity, input } = await start();
  await activities.approve({ ...input, autoAllow: true });
  await vi.waitFor(() => expect(activity.status).toBe('completed'));
  const id = await activities.start({ prompt: 'Worker assignment', model: 'test' }, activity);
  const worker = store.state.activities.find((item) => item.id === id)!;
  await vi.waitFor(() => expect(worker.approval).toBeDefined());
  expect(worker.permissions).toBeUndefined();
  await activities.approve({ activityId: id, approvalId: worker.approval!.id, approved: false });
  await vi.waitFor(() => expect(worker.status).toBe('cancelled'));
});

test('changing the MCP endpoint while a decision is pending cannot use the old approval for the new server', async () => {
  const { store, execute, activities, start } = setup('fused');
  const { activity, input } = await start();
  store.state.fusedIntegrations![0] = { ...store.state.fusedIntegrations![0], url: 'https://different.example/mcp', revision: 'two' };
  await activities.approve(input);
  await vi.waitFor(() => expect(activity.status).toBe('completed'));
  expect(execute).not.toHaveBeenCalled();
  expect(activity.events.some((event) => event.includes('MCP server changed'))).toBe(true);
});

test('session-wide approval settings save atomically and asking again clears automatic categories', async () => {
  const { activities, store, start } = setup();
  const { activity, input } = await start();
  await activities.approve(input);
  await vi.waitFor(() => expect(activity.status).toBe('completed'));
  await activities.setSessionApprovals(activity.id, true);
  expect(activity.allowAllApprovals).toBe(true);
  vi.mocked(store.save).mockRejectedValueOnce(new Error('disk full'));
  await expect(activities.setSessionApprovals(activity.id, false)).rejects.toThrow('disk full');
  expect(activity.allowAllApprovals).toBe(true);
  activity.permissions = { browser: true };
  await activities.setSessionApprovals(activity.id, false);
  expect(activity.allowAllApprovals).toBe(false);
  expect(activity.permissions).toEqual({});
});
