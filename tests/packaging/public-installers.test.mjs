import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platforms, prepareInstallers, validatePackagingRun } from '../../scripts/prepare-public-installers.mjs';

test('publication accepts only successful packaging pushes from our main branch', () => {
  const run = { status: 'completed', conclusion: 'success', head_repository: { full_name: 'Usefused/Dextana' }, head_branch: 'main', path: '.github/workflows/package.yml', event: 'push', head_sha: 'a'.repeat(40) };
  assert.doesNotThrow(() => validatePackagingRun(run, 'Usefused/Dextana'));
  for (const change of [{ conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' }, { head_branch: 'feature' }, { head_repository: { full_name: 'someone/fork' } }, { path: 'other.yml' }, { head_sha: 'invalid' }]) {
    assert.throws(() => validatePackagingRun({ ...run, ...change }, 'Usefused/Dextana'));
  }
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-public-installers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [artifact, suffix] of platforms) {
    const path = join(directory, artifact);
    await mkdir(path);
    const name = `Dextana-0.1.0-${suffix}`;
    const bytes = Buffer.from(`installer ${suffix}`);
    await writeFile(join(path, name), bytes);
    await writeFile(join(path, 'SHA256SUMS'), `${createHash('sha256').update(bytes).digest('hex')}  ${name}\n`);
    await writeFile(join(path, 'build.log'), 'not public');
  }
  return directory;
}

test('publishes only three byte-identical installers and a manifest with durable names', async t => {
  const input = await fixture(t);
  const output = join(input, 'public');
  assert.equal(await prepareInstallers(input, output), '0.1.0');
  assert.deepEqual((await readdir(output)).sort(), ['Dextana-linux-x86_64.AppImage', 'Dextana-mac-arm64.dmg', 'Dextana-win-x64.exe', 'SHA256SUMS']);
  for (const [artifact, suffix] of platforms) {
    const contents = await readFile(join(output, `Dextana-${suffix}`));
    assert.deepEqual(contents, await readFile(join(input, artifact, `Dextana-0.1.0-${suffix}`)));
    assert.ok((await readFile(join(output, 'SHA256SUMS'), 'utf8')).includes(`${createHash('sha256').update(contents).digest('hex')}  Dextana-${suffix}\n`));
  }
});

test('refuses missing platforms and tampered installers before staging any download', async t => {
  const input = await fixture(t);
  const output = join(input, 'public');
  await writeFile(join(input, platforms[2][0], `Dextana-0.1.0-${platforms[2][1]}`), 'changed');
  await assert.rejects(prepareInstallers(input, output), /checksum mismatch/);
  await assert.rejects(readdir(output), { code: 'ENOENT' });
  await rm(join(input, platforms[2][0]), { recursive: true });
  await assert.rejects(prepareInstallers(input, output));
});
