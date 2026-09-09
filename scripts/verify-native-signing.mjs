import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Native publisher-signature verification failed.');
}
if (process.platform === 'darwin') {
  const app = [`release/mac-${process.arch}/Dextana.app`, 'release/mac/Dextana.app'].find(existsSync);
  if (!app) throw new Error('Packaged macOS app is missing.');
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
  run('xcrun', ['stapler', 'validate', app]);
} else if (process.platform === 'win32') {
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $ErrorActionPreference = 'Stop'
    $files = @(Get-ChildItem -LiteralPath 'release/win-unpacked' -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll', '.pyd' })
    $files += @(Get-ChildItem -LiteralPath 'release' -File -Filter '*.exe')
    if ($files.Count -eq 0) { throw 'No Windows binaries found.' }
    foreach ($file in $files) {
      $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
      if ($signature.Status -ne 'Valid') { throw ('Invalid publisher signature: ' + $file.FullName) }
    }
    Write-Output ('Verified publisher signatures for ' + $files.Count + ' Windows binaries.')
  `]);
}
