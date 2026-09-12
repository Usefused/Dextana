import { expect, test, vi } from 'vitest';
import { DesktopComputer } from '../../src/main/desktop/computer';
import { DesktopGateway } from '../../src/main/desktop/gateway';
import { computerProvider } from '../../src/main/desktop/computer-provider';
import type { ComputerAdapter, ComputerResult } from '../../src/main/desktop/cua-adapter';

function fixture() {
  const call = vi.fn<
    (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<ComputerResult>
  >(async (name: string) =>
    name === 'launch_app'
      ? {
          data: { pid: 12, name: 'Trial', launch_state: 'window_ready' },
          images: [],
        }
      : name === 'get_window_state'
        ? {
            data: {
              snapshot_id: 's00000001',
              elements: [
                { element_index: 0, role: 'AXWindow', label: 'Trial' },
                { element_index: 3, parent_index: 0, label: 'Document text', role: 'text' },
              ],
            },
            images: [],
          }
        : { data: {}, images: [] },
  );
  const close = vi.fn();
  const adapter: ComputerAdapter = {
    permissions: vi.fn().mockResolvedValue({ accessibility: true, screenRecording: true }),
    openSettings: vi.fn().mockResolvedValue(undefined),
    launchApplication: vi.fn().mockResolvedValue(undefined),
    windows: vi.fn().mockResolvedValue([
      {
        id: '12:34',
        pid: 12,
        windowId: 34,
        application: 'Trial',
        title: 'Disposable document',
        onScreen: true,
        onCurrentSpace: true,
        zIndex: 1,
      },
    ]),
    lease: vi.fn().mockResolvedValue({ call, close }),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
  const changed = vi.fn();
  const cursor = { move: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
  const guide = vi.fn();
  const service = new DesktopComputer(adapter, changed, cursor, guide);
  return {
    service,
    adapter,
    call,
    close,
    changed,
    cursor,
    guide,
    signal: new AbortController().signal,
  };
}

test('permission checks and settings guidance do not start the native desktop session', async () => {
  const f = fixture();
  await f.service.enable();
  await f.service.openSettings('accessibility');
  expect(f.adapter.openSettings).toHaveBeenCalledWith('accessibility');
  expect(f.adapter.lease).not.toHaveBeenCalled();
  expect(f.service.status('chat')).toMatchObject({
    enabled: true,
    instruction: expect.stringContaining('each desktop inspection'),
  });
  await f.service.dispose();
});

test('missing permissions open the guided Computer use settings page', async () => {
  const f = fixture();
  vi.mocked(f.adapter.permissions).mockResolvedValue({
    accessibility: false,
    screenRecording: true,
  });
  const provider = computerProvider(f.service);
  await provider.execute('computer.status', {}, { activityId: 'chat' }, f.signal);
  expect(f.guide).toHaveBeenCalledOnce();
  await f.service.dispose();
});

test('a reviewed observation starts desktop scope automatically and keeps chat ownership internal', async () => {
  const f = fixture();
  const observed = await f.service.execute('chat', { application: 'Trial' }, f.signal);
  expect(f.adapter.lease).toHaveBeenCalledWith('Dext');
  expect(f.call).toHaveBeenNthCalledWith(
    1,
    'bring_to_front',
    { pid: 12, window_id: 34 },
    expect.any(AbortSignal),
  );
  expect(f.call).toHaveBeenNthCalledWith(
    2,
    'get_window_state',
    {
      pid: 12,
      window_id: 34,
      max_elements: 300,
      max_depth: 18,
      max_dimension: 1280,
    },
    expect.any(AbortSignal),
  );
  expect(observed).toMatchObject({
    application: 'Trial',
    window: 'Disposable document',
    snapshotId: 's00000001',
    returned_element_count: 2,
  });
  expect(f.service.status('other').active).toBeUndefined();
  expect(f.service.status('chat').active).toMatchObject({ state: 'ready' });
  await f.service.dispose();
});

test('launch starts an installed app by name, waits for its window and brings it forward', async () => {
  const f = fixture();
  const launched = await f.service.launch('chat', { application: 'Trial' }, f.signal);
  expect(f.call).toHaveBeenNthCalledWith(
    1,
    'launch_app',
    { name: 'Trial' },
    expect.any(AbortSignal),
  );
  expect(f.call).toHaveBeenNthCalledWith(
    2,
    'bring_to_front',
    { pid: 12, window_id: 34 },
    expect.any(AbortSignal),
  );
  expect(launched).toMatchObject({
    launched: true,
    application: 'Trial',
    state: 'window_ready',
    window: 'Disposable document',
  });
  expect(JSON.stringify(f.call.mock.calls)).not.toContain('launch_path');
  await f.service.dispose();
});

test('launch falls back to macOS LaunchServices when the native driver cannot open the app', async () => {
  const f = fixture();
  vi.mocked(f.adapter.windows).mockResolvedValue([
    {
      id: '12:34',
      pid: 12,
      windowId: 34,
      application: 'Calculator',
      title: 'Calculator',
      onScreen: true,
      onCurrentSpace: true,
      zIndex: 1,
    },
  ]);
  f.call.mockImplementation(async (name: string) => {
    if (name === 'launch_app') throw new Error('Native launch unavailable');
    return { data: {}, images: [] };
  });
  const launched = await f.service.launch('chat', { application: 'Calculator' }, f.signal);
  expect(f.adapter.launchApplication).toHaveBeenCalledWith('Calculator', expect.any(AbortSignal));
  expect(f.call).toHaveBeenLastCalledWith(
    'bring_to_front',
    { pid: 12, window_id: 34 },
    expect.any(AbortSignal),
  );
  expect(launched).toMatchObject({
    launched: true,
    application: 'Calculator',
    state: 'requested',
    window: 'Calculator',
  });
  await f.service.dispose();
});

test('each input needs a fresh observation and sends no model-controlled window target', async () => {
  const f = fixture();
  const args = {
    snapshotId: 's00000001',
    elementIndex: 3,
    action: 'type',
    text: 'Trial text',
  };
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('expired');
  await f.service.execute('chat', { application: 'Trial' }, f.signal);
  expect(f.service.review('chat', args)).toMatchObject({
    application: 'Trial',
    window: 'Disposable document',
    element: 'Document text',
    text: 'Trial text',
  });
  await f.service.execute('chat', args, f.signal);
  expect(f.cursor.move).toHaveBeenCalledWith(
    expect.objectContaining({ element_index: 3, label: 'Document text' }),
    'type',
  );
  expect(f.call.mock.calls[2]).toEqual([
    'bring_to_front',
    { pid: 12, window_id: 34 },
    expect.any(AbortSignal),
  ]);
  expect(f.call.mock.calls[3]).toEqual([
    'type_text',
    {
      pid: 12,
      window_id: 34,
      text: 'Trial text',
      element_index: 3,
      snapshot_id: 's00000001',
      delivery_mode: 'foreground',
    },
    expect.any(AbortSignal),
  ]);
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('expired');
  await f.service.dispose();
});

test('Stop closes the active session and invalidates its observations', async () => {
  const f = fixture();
  await f.service.execute('chat', { application: 'Trial' }, f.signal);
  f.service.stop();
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.cursor.hide).toHaveBeenCalled();
  expect(f.service.snapshot().active?.state).toBe('stopped');
  expect(() =>
    f.service.review('chat', {
      snapshotId: 's00000001',
      elementIndex: 3,
      action: 'click',
    }),
  ).toThrow('expired');
  await f.service.dispose();
});

test('late observation cannot revive a stopped session and parallel calls are refused', async () => {
  const f = fixture();
  let finish!: (value: ComputerResult) => void;
  f.call.mockImplementation((name: string) =>
    name === 'bring_to_front'
      ? Promise.resolve({ data: {}, images: [] })
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  const pending = f.service.execute('chat', { application: 'Trial' }, f.signal);
  await vi.waitFor(() => expect(f.call).toHaveBeenCalled());
  await expect(f.service.execute('chat', { application: 'Trial' }, f.signal)).rejects.toThrow(
    'already running',
  );
  f.service.stop();
  finish({ data: { snapshot_id: 's00000002', elements: [] }, images: [] });
  await expect(pending).rejects.toThrow();
  expect(f.service.snapshot().active?.state).toBe('stopped');
  await f.service.dispose();
});

test('permission revocation prevents capture and stops computer use', async () => {
  const f = fixture();
  vi.mocked(f.adapter.permissions).mockResolvedValue({
    accessibility: false,
    screenRecording: true,
  });
  await expect(f.service.execute('chat', { application: 'Trial' }, f.signal)).rejects.toThrow(
    'permissions',
  );
  expect(f.call).not.toHaveBeenCalled();
  expect(f.service.snapshot().enabled).toBe(false);
  await f.service.dispose();
});

test('a cancelled or uncertain input consumes its snapshot and is never replayed', async () => {
  const f = fixture();
  await f.service.execute('chat', { application: 'Trial' }, f.signal);
  f.call.mockImplementation((name: string) =>
    name === 'bring_to_front'
      ? Promise.resolve({ data: {}, images: [] })
      : Promise.reject(new Error('Delivery uncertain')),
  );
  const args = { snapshotId: 's00000001', elementIndex: 3, action: 'click' };
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('uncertain');
  await expect(f.service.execute('chat', args, f.signal)).rejects.toThrow('expired');
  await f.service.dispose();
});

test('ending a used turn and idle expiry both close the desktop session', async () => {
  vi.useFakeTimers();
  const f = fixture();
  await f.service.execute('chat', { application: 'Trial' }, f.signal);
  f.service.release('other');
  expect(f.close).not.toHaveBeenCalled();
  f.service.release('chat');
  expect(f.close).toHaveBeenCalledOnce();
  await f.service.execute('chat', { application: 'Trial' }, f.signal);
  vi.advanceTimersByTime(300_001);
  expect(f.service.snapshot().active?.state).toBe('stopped');
  await f.service.dispose();
  vi.useRealTimers();
});

test('the model cannot inject process targets, delivery modes, or obsolete selections', async () => {
  const f = fixture();
  const gateway = new DesktopGateway([computerProvider(f.service)]);
  const context = { activityId: 'chat' };
  gateway.discover(context, 'computer');
  for (const args of [
    { application: 'Trial', pid: 999 },
    { application: 'Trial', delivery_mode: 'foreground' },
    { application: 'Trial', selectionId: 'old' },
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

test('window observations omit duplicate Markdown and controls outside the resolved window', async () => {
  const f = fixture();
  f.call.mockResolvedValue({
    data: {
      snapshot_id: 's00000001',
      tree_markdown: 'DUPLICATE DESKTOP TEXT',
      elements: [
        { element_index: 0, role: 'AXWindow' },
        { element_index: 1, parent_index: 0, role: 'AXButton', label: 'Save' },
        { element_index: 2, role: 'AXMenuBar' },
        { element_index: 3, parent_index: 2, role: 'AXMenuItem', label: 'Quit' },
      ],
    },
    images: [],
  });
  const state = await f.service.execute('chat', { application: 'Trial' }, f.signal);
  expect(JSON.stringify(state)).not.toContain('DUPLICATE DESKTOP TEXT');
  expect(JSON.stringify(state)).not.toContain('Quit');
  expect(() =>
    f.service.review('chat', {
      snapshotId: 's00000001',
      elementIndex: 3,
      action: 'click',
    }),
  ).toThrow('Choose an element');
  await f.service.dispose();
});
