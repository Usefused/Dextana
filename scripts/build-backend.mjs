import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

const root = resolve('.');
const output = join(root, '.build/backend');
const compiler = process.env.HARNEST_COMPILER || 'harnest';
const version = spawnSync(compiler, ['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0)
  throw new Error(
    'Build-time Harnest compiler is missing. Set HARNEST_COMPILER or install Harnest on the build machine. End users do not need it.',
  );
if (!version.stdout.includes('0.16.0'))
  throw new Error(
    'This backend build requires Harnest 0.16.0. Update the compiler pin and locks together.',
  );
const sourceFiles = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.(py|md|yaml|yml|toml|lock|json)$/.test(entry.name))
      sourceFiles.push(path);
  }
}
await walk(join(root, 'agent'));
sourceFiles.sort();
const digest = createHash('sha256')
  .update(version.stdout)
  .update(process.platform + process.arch)
  .update(await readFile(new URL(import.meta.url)));
for (const path of sourceFiles) digest.update(relative(root, path)).update(await readFile(path));
const fingerprint = digest.digest('hex');
try {
  if (JSON.parse(await readFile(join(output, 'build.json'), 'utf8')).fingerprint === fingerprint) {
    console.log('Compiled backend is current.');
    process.exit(0);
  }
} catch {
  /* First build or incomplete previous output. */
}
await mkdir(join(root, '.build'), { recursive: true });
const staging = await mkdtemp(join(root, '.build/backend-stage-'));
const source = join(staging, 'source-agent');
const bundle = join(staging, 'bundle');
const logPath = join(root, '.build/backend-build.log');
const log = openSync(logPath, 'w');
function run(command, args) {
  const result = spawnSync(command, args, {
    env: { ...process.env, LITELLM_LOCAL_MODEL_COST_MAP: 'True' },
    stdio: ['ignore', log, log],
    timeout: 900_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Backend build failed; see ${logPath}. ${result.error?.message ?? ''}`);
}
try {
  for (const path of sourceFiles) {
    const target = join(source, relative(join(root, 'agent'), path));
    await mkdir(dirname(target), { recursive: true });
    await cp(path, target);
  }
  run(compiler, ['env', 'sync', source, '--profile', 'runtime', '--frozen']);
  run(compiler, ['compile', source, '--output', join(bundle, 'agent')]);
  // Compiler metadata identifies its locked production environment. Never ship
  // the CLI, build-machine virtualenv, developer caches, or their absolute paths.
  const environment = JSON.parse(await readFile(join(source, '.harnest/environment.json'), 'utf8'));
  const environmentRoot = resolve(source, '.harnest', environment.directory);
  if (!environmentRoot.startsWith(resolve(source, '.harnest') + sep))
    throw new Error('Unexpected compiler environment path.');
  const interpreter = join(
    environmentRoot,
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  const info = spawnSync(
    interpreter,
    [
      '-c',
      'import json,sys,sysconfig; print(json.dumps(dict(base=sys.base_prefix,packages=sysconfig.get_path("purelib"),version="%s.%s"%sys.version_info[:2])))',
    ],
    { encoding: 'utf8' },
  );
  if (info.status !== 0) throw new Error('Cannot inspect the compiled backend runtime.');
  const runtime = JSON.parse(info.stdout);
  // Harnest-managed Python is python-build-standalone. A system/framework Python
  // cannot be copied safely into an installer, so fail instead of shipping it.
  await stat(join(runtime.base, 'BUILD')).catch(() => {
    throw new Error(
      'Packaging requires Harnest-managed standalone Python, not a system Python installation.',
    );
  });
  const python = join(bundle, 'python');
  const filter = (path) =>
    !path.split(/[\\/]/).some((part) => part === '__pycache__') && !path.endsWith('.pyc');
  await cp(runtime.base, python, { recursive: true, dereference: true, filter });
  const packages = join(
    python,
    process.platform === 'win32'
      ? 'Lib/site-packages'
      : `lib/python${runtime.version}/site-packages`,
  );
  await cp(runtime.packages, packages, { recursive: true, dereference: true, filter });
  const executable = join(python, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
  run(executable, [
    '-I',
    '-B',
    '-c',
    'import harnest, google.adk, litellm; from harnest.runtime import main',
  ]);
  await writeFile(
    join(bundle, 'build.json'),
    JSON.stringify(
      {
        fingerprint,
        compiler: '0.16.0',
        platform: process.platform,
        arch: process.arch,
        python: runtime.version,
      },
      null,
      2,
    ),
  );
  // Include dependency licence metadata with the private runtime.
  await writeFile(
    join(bundle, 'NOTICE.txt'),
    'Dextana includes a compiled Harnest ADK backend and a private CPython runtime. Dependency licences are preserved in python/**/site-packages/*.dist-info and the Python distribution. The Harnest compiler is not included.\n',
  );
  await rm(output, { recursive: true, force: true });
  await rename(bundle, output);
  console.log(`Compiled backend and private Python runtime ready: ${output}`);
} finally {
  closeSync(log);
  await rm(staging, { recursive: true, force: true });
}
