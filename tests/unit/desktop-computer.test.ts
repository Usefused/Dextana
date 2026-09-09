import { expect, test, vi } from 'vitest';
import { DesktopComputer } from '../../src/main/desktop/computer';
import { DesktopGateway } from '../../src/main/desktop/gateway';
import { computerProvider } from '../../src/main/desktop/computer-provider';
import type { ComputerAdapter } from '../../src/main/desktop/cua-adapter';

function fixture() {
  const call = vi.fn().mockResolvedValue({
    data: {
      snapshot_id: 's00000001',
      elements: [
        { element_index: 0, role: 'AXWindow' },
        { element_index: 3, parent_index: 0, label: 'Document text', role: 'text' },
      ],
    },
    images: [],
  });
  const close = vi.fn();
  const adapter: ComputerAdapter = {
    permissions: vi.fn().mockResolvedValue({ accessibility: true, screenRecording: true }),
    windows: vi
      .fn()
      .mockResolvedValue([
        { id: '12:34', pid: 12, windowId: 34, application: 'Trial', title: 'Disposable document' },
      ]),
    lease: vi.fn().mockResolvedValue({ call, close }),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  const changed = vi.fn();
  const service = new DesktopComputer(adapter, changed);
  return { service, adapter, call, close, changed };
}
async function selected() {
  const f = fixture();
  await f.service.enable();
  const snapshot = await f.service.select('12:34', 'chat');
  return { ...f, selectionId: snapshot.selection!.id, signal: new AbortController().signal };
}

test('native driver remains unused until enabled and selected by owner', async () => {
  const f = fixture();
  await expect(f.service.windows()).rejects.toThrow('Enable');
  expect(f.adapter.windows).not.toHaveBeenCalled();
  await expect(
    f.service.execute('chat', { selectionId: 'made-up' }, new AbortController().signal),
  ).rejects.toThrow('Select');
});
test('window ownership and chat isolation cannot be overridden by agent arguments', async () => {
  const f = await selected();
  expect(f.service.status('other').selection).toBeUndefined();
  await expect(
    f.service.execute('other', { selectionId: f.selectionId }, f.signal),
  ).rejects.toThrow('Select');
  await expect(f.service.select('99:99', 'chat')).rejects.toThrow('closed');
  expect(f.call).not.toHaveBeenCalled();
  await f.service.dispose();
});
test('each input needs a fresh observation and binds the exact native window', async () => {
  const f = await selected();
  const args = {
    selectionId: f.selectionId,
    snapshotId: 's00000001',
    elementIndex: 3,
    action: 'type',
    text: 'Trial text',
  };
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('expired');
  await f.service.execute('chat', { selectionId: f.selectionId }, f.signal);
  expect(f.service.review('chat', args)).toMatchObject({
    application: 'Trial',
    element: 'Document text',
    text: 'Trial text',
  });
  await f.service.execute('chat', args, f.signal);
  expect(f.call.mock.calls[1]).toEqual([
    'type_text',
    {
      pid: 12,
      window_id: 34,
      text: 'Trial text',
      element_index: 3,
      snapshot_id: 's00000001',
      delivery_mode: 'background',
    },
    expect.any(AbortSignal),
  ]);
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('expired');
  await f.service.dispose();
});
test('Stop invalidates already prepared approval and closing a lease precedes further input', async () => {
  const f = await selected();
  const gateway = new DesktopGateway([computerProvider(f.service)]);
  gateway.discover({ activityId: 'chat' }, 'computer');
  const plan = await gateway.prepare(
    { activityId: 'chat' },
    {
      action: 'call',
      operation: 'computer.observe',
      arguments_json: JSON.stringify({ selectionId: f.selectionId }),
    },
  );
  f.service.stop();
  await expect(plan.execute(f.signal)).rejects.toThrow('stopped');
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.call).not.toHaveBeenCalled();
  await f.service.dispose();
});
test('late observation cannot revive stopped session; parallel calls are refused', async () => {
  const f = await selected();
  let finish!: (value: unknown) => void;
  f.call.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.service.execute('chat', { selectionId: f.selectionId }, f.signal);
  await vi.waitFor(() => expect(f.call).toHaveBeenCalled());
  await expect(f.service.execute('chat', { selectionId: f.selectionId }, f.signal)).rejects.toThrow(
    'already running',
  );
  f.service.stop();
  finish({ data: { snapshot_id: 's00000002', elements: [] }, images: [] });
  await expect(pending).rejects.toThrow();
  expect(f.service.snapshot().selection?.state).toBe('stopped');
  await f.service.dispose();
});
test('permission revocation prevents capture and stops the window', async () => {
  const f = await selected();
  vi.mocked(f.adapter.permissions).mockResolvedValue({
    accessibility: false,
    screenRecording: true,
  });
  await expect(f.service.execute('chat', { selectionId: f.selectionId }, f.signal)).rejects.toThrow(
    'permissions',
  );
  expect(f.call).not.toHaveBeenCalled();
  expect(f.service.snapshot().enabled).toBe(false);
  await f.service.dispose();
});
test('a cancelled or uncertain input consumes its snapshot and is never replayed', async () => {
  const f = await selected();
  await f.service.execute('chat', { selectionId: f.selectionId }, f.signal);
  f.call.mockRejectedValue(new Error('Delivery uncertain'));
  const args = {
    selectionId: f.selectionId,
    snapshotId: 's00000001',
    elementIndex: 3,
    action: 'click',
  };
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('uncertain');
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('expired');
  await f.service.dispose();
});
test('release preserves an unused selection but ends a used turn; idle expiry also revokes', async () => {
  vi.useFakeTimers();
  const f = await selected();
  f.service.release('chat');
  expect(f.service.snapshot().selection?.state).toBe('ready');
  await f.service.execute('chat', { selectionId: f.selectionId }, f.signal);
  f.service.release('other');
  expect(f.close).not.toHaveBeenCalled();
  f.service.release('chat');
  expect(f.close).toHaveBeenCalledOnce();
  await f.service.select('12:34', 'chat');
  vi.advanceTimersByTime(300_001);
  expect(f.service.snapshot().selection?.state).toBe('stopped');
  await f.service.dispose();
  vi.useRealTimers();
});
test('model cannot access the generic SDK, other windows, or foreground delivery', async () => {
  const f = await selected();
  const gateway = new DesktopGateway([computerProvider(f.service)]);
  const context = { activityId: 'chat' };
  gateway.discover(context, 'computer');
  for (const args of [
    { selectionId: f.selectionId, pid: 999 },
    { selectionId: f.selectionId, delivery_mode: 'foreground' },
  ])
    await expect(
      gateway.prepare(context, {
        action: 'call',
        operation: 'computer.observe',
        arguments_json: JSON.stringify(args),
      }),
    ).rejects.toThrow('not supported');
  await expect(gateway.prepare(context, { action: 'call', operation: 'kill_app' })).rejects.toThrow(
    'not loaded',
  );
  await f.service.dispose();
});

test('window observation excludes global menu branches and does not authorize their elements', async () => {
  const f = await selected();
  f.call.mockResolvedValue({
    data: {
      snapshot_id: 's00000001',
      tree_markdown: 'GLOBAL MENU PRIVATE',
      elements: [
        { element_index: 0, role: 'AXWindow' },
        { element_index: 1, parent_index: 0, role: 'AXButton', label: 'Save' },
        { element_index: 2, role: 'AXMenuBar' },
        { element_index: 3, parent_index: 2, role: 'AXMenuItem', label: 'Shut down' },
      ],
    },
    images: [],
  });
  const state = await f.service.execute('chat', { selectionId: f.selectionId }, f.signal);
  expect(JSON.stringify(state)).not.toContain('Shut down');
  expect(JSON.stringify(state)).not.toContain('GLOBAL MENU PRIVATE');
  expect(() =>
    f.service.review('chat', {
      selectionId: f.selectionId,
      snapshotId: 's00000001',
      elementIndex: 3,
      action: 'click',
    }),
  ).toThrow('Choose an element');
  await f.service.dispose();
});
