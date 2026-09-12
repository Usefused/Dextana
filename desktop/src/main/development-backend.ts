import { app } from 'electron';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function buildDevelopmentBackend() {
  if (app.isPackaged) throw new Error('Agent rebuilding is available only in development.');
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [join(app.getAppPath(), 'scripts/build-backend.mjs')], {
      cwd: app.getAppPath(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-8000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-8000); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(output || 'Backend build failed.')));
  });
}
