import { expect, test } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('signed installer checksums reject changed binaries, rewritten checksums, and a different signer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-signatures-'));
  const keys = generateKeyPairSync('ed25519');
  const publicKey = join(directory, 'trusted.pem');
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const run = (mode: string, key = privateKey) => spawnSync(process.execPath, [
    resolve('scripts/artifact-integrity.mjs'), mode, directory, publicKey,
  ], { encoding: 'utf8', env: { ...process.env, DEXTANA_ARTIFACT_SIGNING_KEY: key } });
  try {
    await writeFile(publicKey, keys.publicKey.export({ type: 'spki', format: 'pem' }));
    await writeFile(join(directory, 'Dextana.zip'), 'Original installer');
    expect(run('sign').status).toBe(0);
    expect(run('verify', '').status).toBe(0);
    const originalManifest = await readFile(join(directory, 'SHA256SUMS'));
    await writeFile(join(directory, 'Dextana.zip'), 'Modified installer');
    expect(run('verify', '').stderr).toContain('checksum mismatch');
    const modifiedHash = createHash('sha256').update('Modified installer').digest('hex');
    await writeFile(join(directory, 'SHA256SUMS'), `${modifiedHash}  Dextana.zip\n`);
    expect(run('verify', '').stderr).toContain('signature is invalid');
    await writeFile(join(directory, 'SHA256SUMS'), originalManifest);
    const other = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(run('sign', other).stderr).toContain('does not match');
    expect(run('sign', '').stderr).toContain('key is missing');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
