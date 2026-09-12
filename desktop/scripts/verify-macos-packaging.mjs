import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function verify(app) {
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  console.log(`Verified sealed macOS bundle: ${app}`);
}

// An explicit app path also lets us check a downloaded or mounted build.
if (process.platform === 'darwin') {
  if (process.argv[2]) {
    verify(resolve(process.argv[2]));
  } else {
    const release = resolve(process.env.DEXTANA_RELEASE_DIR || 'release');
    const installers = readdirSync(release).filter((name) =>
      /^Dextana-.*-mac-.*\.(dmg|zip)$/.test(name),
    );
    if (
      !installers.some((name) => name.endsWith('.dmg')) ||
      !installers.some((name) => name.endsWith('.zip'))
    ) {
      throw new Error(
        'Build both macOS installers with npm run dist before verifying distribution.',
      );
    }
    for (const installer of installers) {
      const directory = mkdtempSync(join(tmpdir(), 'dextana-installer-check-'));
      const mount = join(directory, 'volume');
      let mounted = false;
      try {
        const isDmg = installer.endsWith('.dmg');
        if (isDmg) {
          run('hdiutil', [
            'attach',
            '-readonly',
            '-nobrowse',
            '-mountpoint',
            mount,
            join(release, installer),
          ]);
          mounted = true;
        } else {
          run('ditto', ['-x', '-k', join(release, installer), directory]);
        }
        const app = join(isDmg ? mount : directory, 'Dextana.app');
        verify(app);
        if (!isDmg) {
          // Only modify our disposable extracted copy, never the build or installer.
          appendFileSync(join(app, 'Contents/Resources/LICENSE'), '\nTamper detection probe\n');
          const tampered = spawnSync('codesign', ['--verify', '--deep', '--strict', app], {
            encoding: 'utf8',
          });
          if (tampered.error) throw tampered.error;
          if (tampered.status === 0 || !/resource.*(modified|invalid)/i.test(tampered.stderr)) {
            throw new Error(
              `A modified bundle was not rejected for resource tampering: ${tampered.stderr}`,
            );
          }
          console.log('Verified that modifying a sealed resource invalidates the bundle.');
        }
      } finally {
        // Do not recursively remove a mount point if unmounting fails.
        if (mounted) run('hdiutil', ['detach', mount]);
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
}
