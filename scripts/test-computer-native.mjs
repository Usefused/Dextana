import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Explicit opt-in test: launches only our disposable AppKit fixture and the actual Electron SDK.
if (process.platform !== 'darwin') throw new Error('The native trial fixture requires macOS.');
const directory = await mkdtemp('/private/tmp/dext-computer-trial-');
const fixture = join(directory, 'DextComputerTrial.app');
await mkdir(join(fixture, 'Contents/MacOS'), { recursive: true });
await mkdir(join(directory, 'reference'));
await writeFile(
  join(directory, 'reference/reference.txt'),
  'Disposable reference for the Dext computer trial.',
);
await writeFile(
  join(fixture, 'Contents/Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.dextana.computer-trial</string><key>CFBundleName</key><string>Dext Computer Trial</string><key>CFBundleExecutable</key><string>trial</string><key>NSPrincipalClass</key><string>NSApplication</string></dict></plist>`,
);
const compile = spawnSync(
  '/usr/bin/swiftc',
  [
    '-module-cache-path',
    join(tmpdir(), 'dext-computer-swift-cache'),
    'tests/fixtures/computer-trial.swift',
    '-o',
    join(fixture, 'Contents/MacOS/trial'),
  ],
  { stdio: 'inherit' },
);
if (compile.status !== 0) process.exit(compile.status ?? 1);
await mkdir('.build', { recursive: true });
const host = resolve('.build/cua-trial-host.cjs');
await build({
  entryPoints: ['scripts/test-computer-native-host.ts'],
  outfile: host,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', '@trycua/cua-driver'],
});
const run = spawnSync(resolve('node_modules/.bin/electron'), [host, directory], {
  stdio: 'inherit',
  env: process.env,
});
console.log(`Native trial artifacts: ${directory}`);
process.exit(run.status ?? 1);
