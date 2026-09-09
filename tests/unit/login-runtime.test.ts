import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

it.each(['no-worker', 'old-permissions', 'old-worker', 'missing-receiver', 'ready'])(
  'checks the loaded extension before offering sensitive access: %s',
  async (state) => {
    const elements: Record<string, any> = {};
    const element = (id: string) =>
      (elements[id] ??= { hidden: true, disabled: false, textContent: '' });
    const manifest: any = {
      background: { service_worker: 'background.js' },
      optional_host_permissions: ['https://*/*', 'http://*/*'],
    };
    if (state === 'no-worker') delete manifest.background;
    if (state === 'old-permissions') manifest.optional_host_permissions = ['https://*/*'];
    const scope: any = {
      setTimeout,
      clearTimeout,
      document: { getElementById: element },
      chrome: {
        runtime: {
          getManifest: () => manifest,
          sendMessage: async () => {
            if (state === 'missing-receiver')
              throw new Error('Could not establish connection. Receiving end does not exist.');
            return { protocol: state === 'old-worker' ? 2 : 3 };
          },
        },
      },
    };
    runInNewContext(readFileSync('browser-extension/runtime.js', 'utf8'), scope);
    if (state === 'ready') {
      await expect(scope.DextanaRuntime.ready()).resolves.toBeUndefined();
      expect(element('reload-extension').hidden).toBe(true);
    } else {
      await expect(scope.DextanaRuntime.ready()).rejects.toThrow('extension needs to reload');
      expect(element('reload-extension').hidden).toBe(false);
      expect(element('connect').disabled).toBe(true);
      expect(element('approve').disabled).toBe(true);
      expect(element('status').textContent).not.toContain('Receiving end');
    }
  },
);
