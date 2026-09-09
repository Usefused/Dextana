import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker() {
  let listener: (message: any, sender: any, respond: (value: any) => void) => boolean | undefined;
  let reads = 0;
  const saved: Record<string, any> = {};
  const popup = 'chrome-extension://test/popup.html';
  const scope = {
    URL,
    setInterval,
    clearInterval,
    importScripts() {},
    DextanaTransfer: {
      categories: ['cookies'],
      connection: () => ({ base: 'http://127.0.0.1:1234', token: 'test' }),
      capture: async () => {
        reads++;
        throw new Error('Capture must not run without permission');
      },
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
      permissions: { contains: async () => false, remove: async () => true },
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
    reads: () => reads,
    send: (message: object, sender = { id: 'test', url: popup }) =>
      new Promise<any>((resolve) => {
        if (!listener(message, sender, resolve)) resolve(undefined);
      }),
  };
}

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
