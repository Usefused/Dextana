import { beforeEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => {
  const driver = {
    callTool: vi.fn(async () => ({
      isError: false,
      images: [],
      structuredJson: JSON.stringify({ windows: [] }),
    })),
    shutdown: vi.fn(async () => {}),
    uniffiDestroy: vi.fn(),
  };
  const session = { callTool: vi.fn(), close: vi.fn() };
  return { driver, session, create: vi.fn(() => driver) };
});
vi.mock('@trycua/cua-driver', () => ({
  CuaDriver: { createConfigured: native.create },
  SessionPermissionMode: { Standard: 0 },
  createTrustedSession: () => native.session,
}));
import { CuaAdapter } from '../../src/main/desktop/cua-adapter';
beforeEach(() => vi.clearAllMocks());

test('concurrent native requests share initialization; shutdown releases and refuses reuse', async () => {
  const adapter = new CuaAdapter();
  const signal = new AbortController().signal;
  await Promise.all([adapter.windows(signal), adapter.windows(signal)]);
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
  await expect(adapter.windows(signal)).rejects.toThrow('shut down');
});

test('native error payloads and rejected input calls never become visible messages', async () => {
  const adapter = new CuaAdapter();
  const lease = await adapter.lease('private-selection');
  const privateError = 'session a348e410-9f5c-4e7b-b98b-47fcdc7b4f9a snapshot_id=private-snapshot';
  native.session.callTool.mockResolvedValueOnce({ isError: true, text: privateError });
  await expect(lease.call('get_window_state', {}, new AbortController().signal)).rejects.toThrow(
    'Could not inspect the selected window.',
  );
  native.session.callTool.mockRejectedValueOnce(new Error(privateError));
  try {
    await lease.call('click', {}, new AbortController().signal);
    expect.fail('Expected an input failure');
  } catch (error) {
    expect((error as Error).message).toBe(
      'Computer input did not return a verified result. Inspect the window before repeating the action.',
    );
    expect(String(error)).not.toContain('private-snapshot');
    expect((error as Error).cause).toBeInstanceOf(Error);
  }
  native.session.close.mockImplementationOnce(() => {
    throw new Error(privateError);
  });
  expect(() => lease.close()).toThrow('Could not confirm that the native window session closed.');
  await adapter.dispose();
});

test('window listing hides driver errors and cancellation retains its semantics', async () => {
  const adapter = new CuaAdapter();
  native.driver.callTool.mockRejectedValueOnce(new Error('private-session-id'));
  await expect(adapter.windows(new AbortController().signal)).rejects.toThrow(
    'Could not list application windows.',
  );
  const controller = new AbortController();
  const reason = new Error('Stopped by owner');
  controller.abort(reason);
  const lease = await adapter.lease('private-selection');
  native.session.callTool.mockRejectedValueOnce(new Error('native cancellation details'));
  await expect(lease.call('click', {}, controller.signal)).rejects.toBe(reason);
  await adapter.dispose();
});
