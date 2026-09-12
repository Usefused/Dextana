import { beforeEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => {
  const driver = {
    shutdown: vi.fn(async () => {}),
    uniffiDestroy: vi.fn(),
  };
  const session = {
    callTool: vi.fn(),
    setAgentCursorEnabled: vi.fn(async () => ({ isError: false, images: [] })),
    close: vi.fn(),
  };
  return { driver, session, create: vi.fn(() => driver) };
});
vi.mock('@trycua/cua-driver', () => ({
  CuaDriver: { createConfigured: native.create },
  SessionPermissionMode: { Standard: 0 },
  createTrustedSession: () => native.session,
}));
import { CuaAdapter, CuaLease } from '../../src/main/desktop/cua-adapter';
beforeEach(() => vi.clearAllMocks());

test('concurrent native requests share initialization; shutdown releases and refuses reuse', async () => {
  const adapter = new CuaAdapter();
  const runtime = () => (adapter as unknown as { runtime(): Promise<unknown> }).runtime();
  await Promise.all([runtime(), runtime()]);
  expect(native.create).toHaveBeenCalledOnce();
  expect(native.create).toHaveBeenCalledWith(
    expect.objectContaining({
      authorization: expect.objectContaining({
        allowedModes: [0],
        unrestrictedAcknowledged: false,
      }),
    }),
  );
  await adapter.dispose();
  expect(native.driver.shutdown).toHaveBeenCalledOnce();
  expect(native.driver.uniffiDestroy).toHaveBeenCalledOnce();
  expect(runtime).toThrow('shut down');
});

test('native error payloads and rejected input calls never become visible messages', async () => {
  const lease = new CuaLease(native.session as never);
  const privateError = 'session a348e410-9f5c-4e7b-b98b-47fcdc7b4f9a snapshot_id=private-snapshot';
  native.session.callTool.mockResolvedValueOnce({ isError: true, text: privateError });
  await expect(lease.call('get_window_state', {}, new AbortController().signal)).rejects.toThrow(
    'Could not inspect the desktop.',
  );
  native.session.callTool.mockRejectedValueOnce(new Error(privateError));
  try {
    await lease.call('click', {}, new AbortController().signal);
    expect.fail('Expected an input failure');
  } catch (error) {
    expect((error as Error).message).toBe(
      'Computer input did not return a verified result. Inspect the desktop before repeating the action.',
    );
    expect(String(error)).not.toContain('private-snapshot');
    expect((error as Error).cause).toBeInstanceOf(Error);
  }
  native.session.close.mockImplementationOnce(() => {
    throw new Error(privateError);
  });
  expect(() => lease.close()).toThrow('Could not confirm that the native desktop session closed.');
});

test('native sessions suppress their cursor so Dext can use its shared branded cursor', async () => {
  const adapter = new CuaAdapter();
  const lease = await adapter.lease('Dext');
  expect(native.session.setAgentCursorEnabled).toHaveBeenCalledWith(
    { session: 'Dext', enabled: false },
    { signal: expect.any(AbortSignal) },
  );
  lease.close();
  await adapter.dispose();
});

test('unsupported native tools are blocked and cancellation retains its semantics', async () => {
  const lease = new CuaLease(native.session as never);
  await expect(lease.call('list_windows', {}, new AbortController().signal)).rejects.toThrow(
    'Unsupported computer action.',
  );
  const controller = new AbortController();
  const reason = new Error('Stopped by owner');
  controller.abort(reason);
  native.session.callTool.mockRejectedValueOnce(new Error('native cancellation details'));
  await expect(lease.call('click', {}, controller.signal)).rejects.toBe(reason);
});

test('the native launch boundary accepts only the reviewed launch tool', async () => {
  const lease = new CuaLease(native.session as never);
  native.session.callTool.mockResolvedValueOnce({
    isError: false,
    structuredJson: '{"pid":12,"name":"Calculator"}',
    images: [],
  });
  await expect(
    lease.call('launch_app', { name: 'Calculator' }, new AbortController().signal),
  ).resolves.toMatchObject({ data: { pid: 12, name: 'Calculator' } });
});
