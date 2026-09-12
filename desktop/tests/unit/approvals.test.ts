import { expect, test, vi } from 'vitest';
import { LocalCapabilities } from '../../src/main/local-capabilities';
import { randomUUID } from 'node:crypto';
import type { Activity } from '../../src/shared/types';
import { Store } from '../../src/main/store';
import type { Browsers } from '../../src/main/browser';
import type { Fused } from '../../src/main/fused';

function setup(name = 'browser') {
  const store = new Store('/unused');
  store.state.settings.models = ['test'];
  store.state.fusedIntegrations = [{ id: 'integration', name: 'Fused', enabled: true, url: 'https://example.com/mcp', hasToken: true, revision: 'one' }];
  vi.spyOn(store, 'save').mockResolvedValue();
  const execute = vi.fn().mockResolvedValue({ done: true });
  const local = new LocalCapabilities(
    store, () => {},
    { execute, prepare: (_id: string, args: unknown) => args } as unknown as Browsers,
    { call: execute, resolve: () => store.state.fusedIntegrations![0] } as unknown as Fused,
  );
  const pending = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  const activities = Object.assign(local, {
    async start(input: { prompt: string; model: string }, parent?: Activity) {
      const activity: Activity = { id: randomUUID(), title: input.prompt, model: input.model, ollamaUrl: '', status: 'running', messages: [], events: [], parentId: parent?.id };
      store.state.activities.push(activity);
      const controller = new AbortController();
      const promise = local.execute(activity, { name, arguments: { action: name === 'browser' ? 'read' : 'list', arguments_json: '{}' } }, controller.signal)
        .then(() => { activity.status = 'completed'; }, () => { activity.status = 'cancelled'; });
      pending.set(activity.id, { controller, promise });
      return activity.id;
    },
    async cancel(id: string) { const item = pending.get(id); item?.controller.abort(); await item?.promise; },
  });
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
  const next = await start();
  next.activity.approval!.source = 'harnest';
  await activities.approve({ ...next.input, autoAllow: true });
  await vi.waitFor(() => expect(next.activity.status).toBe('completed'));
  expect(next.activity.permissions?.mcp).toBe(true);
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
  expect(activity.permissions).toEqual({ browser: false });
});

test('browser defaults apply to new and existing chats, explicit overrides win, and reset restores inheritance', async () => {
  const { activities, store, execute, start } = setup();
  const { activity, input } = await start();
  await activities.approve(input);
  await vi.waitFor(() => expect(activity.status).toBe('completed'));
  execute.mockClear();
  await activities.setBrowserPreferences({ autoAllow: true });
  const tool = { name: 'browser', arguments: { action: 'read' } };
  await activities.execute(activity, tool, new AbortController().signal);
  expect(execute).toHaveBeenCalledTimes(1);
  const newId = await activities.start({ prompt: 'New chat', model: 'test' });
  await vi.waitFor(() => expect(store.state.activities.find(item => item.id === newId)?.status).toBe('completed'));
  expect(execute).toHaveBeenCalledTimes(2);
  expect(activity.permissions).toBeUndefined();

  await activities.setPermission({ activityId: activity.id, capability: 'browser', autoAllow: false });
  const pending = expect(activities.execute(activity, tool, new AbortController().signal)).rejects.toThrow('denied');
  await vi.waitFor(() => expect(activity.approval).toBeDefined());
  expect(execute).toHaveBeenCalledTimes(2);
  await activities.approve({ activityId: activity.id, approvalId: activity.approval!.id, approved: false });
  await pending;
  await activities.setPermission({ activityId: activity.id, capability: 'browser', autoAllow: null });
  expect(activity.permissions?.browser).toBeUndefined();
  await activities.execute(activity, tool, new AbortController().signal);
  expect(execute).toHaveBeenCalledTimes(3);

  await activities.setPermission({ activityId: activity.id, capability: 'browser', autoAllow: true });
  await activities.setBrowserPreferences({ autoAllow: false });
  await activities.execute(activity, tool, new AbortController().signal);
  expect(execute).toHaveBeenCalledTimes(4);
  await activities.setBrowserPreferences({ autoAllow: true });
  await activities.setSessionApprovals(activity.id, false);
  expect(activity.permissions?.browser).toBe(false);
});

test('global browser permission never grants MCP access or accepts an already pending action', async () => {
  const browser = setup();
  const { activity, input } = await browser.start();
  await browser.activities.setBrowserPreferences({ autoAllow: true });
  expect(activity.approval?.id).toBe(input.approvalId);
  expect(browser.execute).not.toHaveBeenCalled();
  await browser.activities.cancel(activity.id);

  const fused = setup('fused');
  await fused.activities.setBrowserPreferences({ autoAllow: true });
  const mcp = await fused.start();
  expect(fused.execute).not.toHaveBeenCalled();
  await fused.activities.cancel(mcp.activity.id);
});

test('unsaved browser defaults cannot authorize actions and failed saves restore the previous default', async () => {
  const { activities, store, execute, start } = setup();
  let rejectSave!: (error: Error) => void;
  vi.mocked(store.save).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
  const saving = activities.setBrowserPreferences({ autoAllow: true });
  const failed = expect(saving).rejects.toThrow('disk full');
  await expect(activities.setBrowserPreferences({ autoAllow: false })).rejects.toThrow('already being saved');
  const { activity } = await start();
  expect(execute).not.toHaveBeenCalled();
  rejectSave(new Error('disk full'));
  await failed;
  expect(store.state.browserPreferences).toBeUndefined();
  await activities.cancel(activity.id);
  await expect(activities.setBrowserPreferences({ autoAllow: 'true' } as any)).rejects.toThrow('Invalid');
  await expect(activities.setPermission({ activityId: activity.id, capability: 'mcp', autoAllow: null } as any)).rejects.toThrow('Invalid');
});
