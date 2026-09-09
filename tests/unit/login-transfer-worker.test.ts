import { it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loginAccess } from '../../src/extension/login-scope';

function worker() {
  let listener: (message: any, sender: any, respond: (value: any) => void) => boolean | undefined;
  let reads = 0;
  let allowed = false;
  const imported: string[] = [];
  const saved: Record<string, any> = {};
  const popup = 'chrome-extension://test/popup.html';
  const scope = {
    DextanaSites: { loginAccess },
    URL,
    AbortController,
    Date,
    setTimeout,
    setInterval,
    clearInterval,
    importScripts(file: string) {
      imported.push(file);
    },
    DextanaTransfer: {
      categories: ['cookies'],
      connection: () => ({ base: 'http://127.0.0.1:1234', token: 'test' }),
      capture: async () => {
        reads++;
        if (!allowed) throw new Error('Capture must not run without permission');
        return {};
      },
      current: async () => {},
      request: async () => ({}),
    },
    chrome: {
      runtime: {
        id: 'test',
        getURL: () => popup,
        getPlatformInfo: async () => ({}),
        onMessage: {
          addListener: (callback: typeof listener) => {
            listener = callback;
          },
        },
      },
      permissions: { contains: async () => allowed, remove: async () => true },
      storage: {
        session: {
          get: async () => saved,
          set: async (value: object) => {
            Object.assign(saved, value);
          },
          remove: async (key: string) => {
            delete saved[key];
          },
        },
      },
    },
  };
  runInNewContext(readFileSync('browser-extension/background.js', 'utf8'), scope);
  return {
    saved,
    imported,
    grant: () => {
      allowed = true;
    },
    reads: () => reads,
    send: (message: object, sender = { id: 'test', url: popup }) =>
      new Promise<any>((resolve) => {
        if (!listener(message, sender, resolve)) resolve(undefined);
      }),
  };
}

it('keeps login transfer available without the browser-control debugger API', async () => {
  const background = worker();
  expect(background.imported).toEqual(['transfer.js', 'site-scope.js']);
  expect(await background.send({ action: 'health' })).toEqual({ protocol: 3 });
  expect(background.reads()).toBe(0);
});

it.each(['grant', 'deny', 'timeout'] as const)(
  'owns permission waiting after the popup disappears: %s',
  async (decision) => {
    vi.useFakeTimers();
    try {
      const background = worker();
      const completed = background.send({
        action: 'transfer',
        code: 'test',
        tab: { url: 'https://example.com' },
        selected: ['cookies'],
        awaitAccess: true,
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(background.saved.transferStatus.state).toBe('awaiting-access');
      expect(background.reads()).toBe(0);
      if (decision === 'grant') background.grant();
      if (decision === 'deny') await background.send({ action: 'cancel-access' });
      await vi.advanceTimersByTimeAsync(decision === 'timeout' ? 60_000 : 500);
      expect(await completed).toMatchObject({
        state: decision === 'grant' ? 'completed' : 'failed',
      });
      expect(background.reads()).toBe(decision === 'grant' ? 1 : 0);
    } finally {
      vi.useRealTimers();
    }
  },
);

it('rejects non-popup requests and refuses capture when site access is missing', async () => {
  const background = worker();
  const request = {
    action: 'transfer',
    code: 'test',
    tab: { url: 'https://example.com' },
    selected: ['cookies'],
  };
  expect(
    await background.send(request, { id: 'test', url: 'https://example.com' }),
  ).toBeUndefined();
  expect(background.saved).toEqual({});
  expect(await background.send(request)).toMatchObject({
    state: 'failed',
    error: expect.stringContaining('declined'),
  });
  expect(background.reads()).toBe(0);
});

it('reports an interrupted upload when the worker restarts instead of showing progress forever', async () => {
  const background = worker();
  background.saved.transferStatus = { state: 'transferring' };
  expect(await background.send({ action: 'status' })).toMatchObject({
    state: 'failed',
    error: expect.stringContaining('interrupted'),
  });
  expect(background.reads()).toBe(0);
});
