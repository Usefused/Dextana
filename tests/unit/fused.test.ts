import { expect, test, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'keyring',
    encryptString: (text: string) => Buffer.from('encrypted:' + text),
    decryptString: (data: Buffer) => data.toString().slice(10),
  },
}));
import { Fused } from '../../src/main/fused';
import { Store } from '../../src/main/store';

test('multiple integrations keep independent secrets, fail closed on ambiguity, and survive restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dext-fused-'));
  const store = new Store(directory);
  const fused = new Fused(store, directory);
  try {
    const first = await fused.save({
      name: 'Sales',
      enabled: true,
      url: 'https://sales.example/mcp',
      token: 'sales-token',
    });
    const second = await fused.save({
      name: 'Support',
      enabled: true,
      url: 'https://support.example/mcp',
      token: 'support-token',
    });
    expect(() => fused.resolve()).toThrow('Multiple');
    expect(fused.resolve(first).name).toBe('Sales');
    expect(fused.resolve(second).name).toBe('Support');
    expect(fused.resolve(first).secretId).not.toBe(fused.resolve(second).secretId);
    const secretId = fused.resolve(first).secretId;
    await fused.save({
      id: first,
      name: 'Sales team',
      enabled: true,
      url: 'https://sales.example/mcp',
      token: '',
    });
    expect(fused.resolve(first).secretId).toBe(secretId);
    await expect(
      fused.save({
        id: first,
        name: 'Sales team',
        enabled: true,
        url: 'https://changed.example/mcp',
        token: '',
      }),
    ).rejects.toThrow('token');
    const restored = new Store(directory);
    await restored.load();
    expect(restored.state.fusedIntegrations).toHaveLength(2);
    expect(await readFile(join(directory, 'state.json'), 'utf8')).not.toContain('sales-token');
    await fused.remove(first);
    expect(fused.resolve().id).toBe(second);
    expect(await readdir(directory)).not.toContain(`fused-${secretId}.enc`);
  } finally {
    await fused.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed replacement saves preserve the original token and remove the uncommitted secret', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dext-fused-'));
  const store = new Store(directory);
  const fused = new Fused(store, directory);
  try {
    const id = await fused.save({
      name: 'Work',
      enabled: true,
      url: 'https://work.example/mcp',
      token: 'original',
    });
    const before = structuredClone(fused.resolve(id));
    const files = (await readdir(directory)).sort();
    vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('Disk full'));
    await expect(
      fused.save({
        id,
        name: 'Work',
        enabled: true,
        url: 'https://work.example/mcp',
        token: 'replacement',
      }),
    ).rejects.toThrow('Disk full');
    expect(fused.resolve(id)).toEqual(before);
    expect((await readdir(directory)).sort()).toEqual(files);
  } finally {
    await fused.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('account keys are isolated from MCP credentials, bound to their URL, and rolled back on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dext-fused-account-'));
  const store = new Store(directory);
  const fused = new Fused(store, directory);
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
  try {
    await fused.saveAccount({ url: 'https://engine.example', licenseKey: 'private-license' });
    expect(request).toHaveBeenCalledWith('https://engine.example/auth/whoami', expect.objectContaining({ headers: { 'X-API-Key': 'private-license' }, redirect: 'error' }));
    expect(await readFile(join(directory, 'state.json'), 'utf8')).not.toContain('private-license');
    expect(fused.connections()).toEqual([]);
    const previous = structuredClone(store.state.fusedAccount);
    await expect(fused.saveAccount({ url: 'https://other.example', licenseKey: '' })).rejects.toThrow('license key');
    request.mockResolvedValue(new Response('private-license', { status: 401 }));
    await expect(fused.saveAccount({ url: 'https://engine.example', licenseKey: 'wrong' })).rejects.toThrow('Could not verify');
    expect(store.state.fusedAccount).toEqual(previous);
    request.mockImplementation(async () => new Response('{}'));
    const fail = vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(fused.saveAccount({ url: 'https://engine.example', licenseKey: 'replacement' })).rejects.toThrow('disk full');
    expect(store.state.fusedAccount).toEqual(previous);
    expect((await readdir(directory)).filter(file => file.endsWith('.enc'))).toHaveLength(1);
    fail.mockRestore();
    await fused.removeAccount();
    expect(store.state.fusedAccount).toBeUndefined();
    expect((await readdir(directory)).filter(file => file.endsWith('.enc'))).toHaveLength(0);
  } finally { request.mockRestore(); await rm(directory, { recursive: true, force: true }); }
});
