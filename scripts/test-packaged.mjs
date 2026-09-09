import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const release = resolve(process.env.DEXTANA_RELEASE_DIR || 'release');
const candidates =
  process.platform === 'darwin'
    ? [
        join(release, `mac-${process.arch}/Dextana.app/Contents/MacOS/Dextana`),
        join(release, 'mac/Dextana.app/Contents/MacOS/Dextana'),
      ]
    : [
        process.platform === 'win32'
          ? join(release, 'win-unpacked/Dextana.exe')
          : join(release, 'linux-unpacked/Dextana'),
      ];
const executable = candidates.map((path) => resolve(path)).find(existsSync);
if (!executable) throw new Error('Package Dextana first with npm run pack.');
if (process.platform === 'darwin') {
  const signature = spawnSync(
    process.execPath,
    ['scripts/verify-macos-packaging.mjs', resolve(dirname(executable), '../..')],
    { stdio: 'inherit' },
  );
  if (signature.error) throw signature.error;
  if (signature.status !== 0) throw new Error('The packaged macOS app has an invalid bundle signature.');
}
const resources =
  process.platform === 'darwin'
    ? resolve(dirname(executable), '../Resources')
    : join(dirname(executable), 'resources');
for (const name of ['manifest.json', 'popup.html', 'popup.css', 'popup.js', 'transfer.js', 'background.js']) {
  if (!existsSync(join(resources, 'browser-extension', name))) throw new Error('The packaged login-transfer extension is incomplete.');
}
const runtimeRoot = join(resources, 'backend/python');
const python = join(runtimeRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const probe = spawnSync(
  python,
  [
    '-I',
    '-B',
    '-c',
    'import json,sys,harnest;print(json.dumps(dict(prefix=sys.prefix,module=harnest.__file__)))',
  ],
  { encoding: 'utf8' },
);
if (probe.status !== 0) throw new Error('The packaged private interpreter failed to start.');
const locations = JSON.parse(probe.stdout);
if (
  resolve(locations.prefix) !== resolve(runtimeRoot) ||
  !resolve(locations.module).startsWith(resolve(runtimeRoot))
)
  throw new Error('The packaged runtime resolved dependencies outside the app.');

const result = spawnSync(
  process.execPath,
  [
    join('node_modules', '@playwright/test/cli.js'),
    'test',
    '--config',
    'playwright.packaged.config.ts',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, DEXTANA_PACKAGED_EXECUTABLE: executable },
  },
);
process.exit(result.status ?? 1);
