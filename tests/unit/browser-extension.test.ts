import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  extensionFiles,
  extensionSource,
  prepareBrowserExtension,
} from '../../src/main/browser-extension';

it('extracts the shipped extension without needing a source checkout and keeps its installation path stable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dextana-extension-'));
  const environment = {
    packaged: true,
    appPath: join(root, 'missing-app.asar'),
    resourcesPath: join(root, 'resources'),
    userData: join(root, 'owner'),
  };
  try {
    await mkdir(extensionSource(environment), { recursive: true });
    await Promise.all(
      extensionFiles.map((file) =>
        writeFile(join(extensionSource(environment), file), 'version one'),
      ),
    );
    const folder = await prepareBrowserExtension(environment);
    expect(await readFile(join(folder, 'manifest.json'), 'utf8')).toBe('version one');
    await writeFile(join(extensionSource(environment), 'manifest.json'), 'version two');
    expect(await prepareBrowserExtension(environment)).toBe(folder);
    expect(await readFile(join(folder, 'manifest.json'), 'utf8')).toBe('version two');
    expect(extensionSource({ ...environment, packaged: false })).toBe(
      join(environment.appPath, 'browser-extension'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
