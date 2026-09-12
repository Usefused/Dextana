import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import catalog from '../../src/shared/integrations-catalog.json';
const electron = vi.hoisted(() => ({ app: { isPackaged: false }, safeStorage: {}, shell: {} }));
vi.mock('electron', () => electron);
import { DextIntegrations } from '../../src/main/integrations';
const directories: string[] = [];
async function client() {
  const directory = await mkdtemp(join(tmpdir(), 'dext-integration-origin-'));
  directories.push(directory);
  return new DextIntegrations(directory, {} as never, {} as never, () => {});
}
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  electron.app.isPackaged = false;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
describe('integration service discovery', () => {
  it('connects development builds to the standalone localhost backend without an environment override', async () => {
    vi.stubEnv('DEXT_INTEGRATIONS_URL', '');
    const fetch = vi.fn(async () =>
      Response.json({ ...catalog, availability: { subscribe: false, signIn: false } }),
    );
    vi.stubGlobal('fetch', fetch);
    const view = await (await client()).command({ action: 'view' });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8787/v1/catalog', expect.any(Object));
    expect(view).toMatchObject({
      configured: true,
      connected: true,
      catalog: { availability: { subscribe: false } },
    });
  });
  it('uses an explicit origin in both development and packaged builds', async () => {
    vi.stubEnv('DEXT_INTEGRATIONS_URL', 'https://integrations.example');
    electron.app.isPackaged = true;
    const fetch = vi.fn(async () => Response.json(catalog));
    vi.stubGlobal('fetch', fetch);
    await (await client()).command({ action: 'view' });
    expect(fetch).toHaveBeenCalledWith('https://integrations.example/v1/catalog', expect.any(Object));
  });
  it('does not discover or contact arbitrary localhost services in packaged builds', async () => {
    vi.stubEnv('DEXT_INTEGRATIONS_URL', '');
    electron.app.isPackaged = true;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await (await client()).command({ action: 'view' })).toMatchObject({
      configured: false,
      catalog,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the catalog browsable while offline and reconnects on refresh', async () => {
    vi.stubEnv('DEXT_INTEGRATIONS_URL', '');
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json(catalog));
    vi.stubGlobal('fetch', fetch);
    const integrations = await client();
    expect(await integrations.command({ action: 'view' })).toMatchObject({
      configured: true,
      connected: false,
      catalog,
    });
    expect(await integrations.command({ action: 'view' })).toMatchObject({ connected: true });
  });
});
