import { test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FusedCLIInstall, compatibleFusedVersion, verifyFusedArchive } from '../../src/main/fused-cli-install';

test('only the verified CLI family is accepted and nonmatching release bytes are rejected', () => {
  expect(compatibleFusedVersion('fused-cli version 0.29.0\n')).toBe('0.29.0');
  for (const output of ['fused-cli version 0.28.0', 'fused-cli version 0.30.0', 'fused-cli version 0.29.0-dev', 'other program 0.29.0']) expect(compatibleFusedVersion(output)).toBeUndefined();
  const bytes = Buffer.from('verified fixture');
  const digest = createHash('sha256').update(bytes).digest('hex');
  expect(() => verifyFusedArchive(bytes, digest)).not.toThrow();
  expect(() => verifyFusedArchive(Buffer.from('replaced executable'), digest)).toThrow('verification failed');
});

test.skipIf(process.platform === 'win32')('a failed private install preserves the working external CLI and cleans staging files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-cli-unit-'));
  const binary = join(directory, 'fused-cli');
  await writeFile(binary, `#!${process.execPath}\nconsole.log('fused-cli version 0.29.0');`, { mode: 0o700 });
  vi.stubEnv('PATH', directory);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not the official archive')));
  try {
    const manager = new FusedCLIInstall(join(directory, 'app'));
    expect((await manager.check()).active).toBe('existing');
    await manager.useExisting();
    expect((await manager.install()).phase).toBe('error');
    expect((await manager.resolve())).toBe(binary);
    expect((await readdir(join(directory, 'app', 'fused-cli'))).some(name => name.startsWith('.install-'))).toBe(false);
  } finally {
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
