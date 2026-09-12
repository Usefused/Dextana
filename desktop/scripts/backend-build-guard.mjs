import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function backendProcesses(output, listing) {
  const executable = join(output, 'python', 'bin', 'python3');
  return listing.split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) return [];
    const command = match[2];
    return command.startsWith(executable + ' ') || command.startsWith('"' + executable + '" ')
      ? [Number(match[1])] : [];
  });
}

export function assertBackendStopped(output) {
  // Packaged apps have a separate runtime; this protects the development bundle.
  if (process.platform === 'win32') return;
  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error('Could not check whether the backend is running. Close Dex and retry the build.');
  const running = backendProcesses(output, result.stdout);
  if (running.length) throw new Error(`Close Dex before rebuilding its backend. Processes ${running.join(', ')} are using this bundle; replacing it would invalidate compiled skills. Then run npm start.`);
}
