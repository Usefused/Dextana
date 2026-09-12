import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const platforms = [
  ['Dextana-macOS-ARM64', 'mac-arm64.dmg'],
  ['Dextana-Windows-X64', 'win-x64.exe'],
  ['Dextana-Linux-X64', 'linux-x86_64.AppImage'],
];

export function validatePackagingRun(run, repository) {
  if (run.status !== 'completed' || run.conclusion !== 'success' ||
      run.head_repository?.full_name !== repository || run.head_branch !== 'main' ||
      run.path !== '.github/workflows/package.yml' || run.event !== 'push' ||
      !/^[0-9a-f]{40}$/.test(run.head_sha)) {
    throw new Error('Only successful first-party main-branch packaging runs can be published.');
  }
}

async function digest(path) {
  if (!(await lstat(path)).isFile()) throw new Error(`Not a regular installer file: ${path}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function prepareInstallers(input, output) {
  const installers = [];
  let version;
  // Validate every platform before staging anything for publication.
  for (const [artifact, suffix] of platforms) {
    const directory = join(input, artifact);
    const candidates = (await readdir(directory)).filter(name => name.endsWith(`-${suffix}`));
    if (candidates.length !== 1) throw new Error(`Expected one ${suffix} installer.`);
    const name = candidates[0];
    const match = /^(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)$/.exec(name.slice('Dextana-'.length, -(`-${suffix}`.length)));
    if (!match || (version && version !== match[1])) throw new Error('Installer versions do not match.');
    version = match[1];
    if (name !== `Dextana-${version}-${suffix}`) throw new Error('Unexpected installer filename.');
    const manifest = (await readFile(join(directory, 'SHA256SUMS'), 'utf8')).split(/\r?\n/);
    const entries = manifest.filter(line => line.endsWith(`  ${name}`));
    const hash = await digest(join(directory, name));
    if (entries.length !== 1 || entries[0] !== `${hash}  ${name}`) throw new Error(`Installer checksum mismatch: ${name}`);
    installers.push({ source: join(directory, name), name: `Dextana-${suffix}`, hash });
  }
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Public installer output directory must be empty.');
  for (const installer of installers) await copyFile(installer.source, join(output, installer.name));
  await writeFile(join(output, 'SHA256SUMS'), installers.map(({ hash, name }) => `${hash}  ${name}\n`).join(''));
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/prepare-public-installers.mjs INPUT OUTPUT');
  console.log(`Verified and staged Dextana ${await prepareInstallers(input, output)} installers for all three platforms.`);
}
