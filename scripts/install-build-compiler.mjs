import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, chmod } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const release = JSON.parse(await readFile('packaging/harnest-release.json', 'utf8'));
const platform = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform];
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!platform || !arch) throw new Error('Unsupported compiler build platform.');
const name = `harnest_${release.version}_${platform}_${arch}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
const asset = release.assets[name];
if (!asset) throw new Error(`No pinned compiler asset for ${name}.`);
const directory = resolve('.build/compiler');
await mkdir(directory, { recursive: true });
const response = await fetch(asset.url);
if (!response.ok) throw new Error(`Cannot download the pinned compiler: HTTP ${response.status}`);
const data = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(data).digest('hex') !== asset.sha256)
  throw new Error('Harnest compiler checksum mismatch.');
const archive = join(directory, name);
await writeFile(archive, data);
const extracted = spawnSync('tar', ['-xf', archive, '-C', directory], { stdio: 'inherit' });
if (extracted.status !== 0) throw new Error('Cannot extract the build compiler.');
const binaryName = process.platform === 'win32' ? 'harnest.exe' : 'harnest';
async function find(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === binaryName) return path;
    if (entry.isDirectory()) {
      const found = await find(path);
      if (found) return found;
    }
  }
}
const binary = await find(directory);
if (!binary) throw new Error('The pinned archive contains no compiler.');
if (process.platform !== 'win32') await chmod(binary, 0o755);
const runtimeDirectory = join(directory, 'runtime');
const installed = spawnSync(binary, ['runtime', 'install', '--directory', runtimeDirectory], {
  stdio: 'inherit',
  timeout: 900_000,
});
if (installed.status !== 0) throw new Error('Could not prepare the build-only compiler runtime.');
if (process.env.GITHUB_ENV) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(
    process.env.GITHUB_ENV,
    `HARNEST_COMPILER=${binary}\nHARNEST_RUNTIME_DIR=${runtimeDirectory}\n`,
  );
}
console.log(`Build compiler ready: ${binary}`);
