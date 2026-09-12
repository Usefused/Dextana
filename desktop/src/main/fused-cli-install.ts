import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import AdmZip from 'adm-zip';
import pinned from '../../packaging/fused-cli-release.json';
import type { FusedCLIInstallation, FusedCLIStatus } from '../shared/types';

const run = promisify(execFile);
const executable = process.platform === 'win32' ? 'fused-cli.exe' : 'fused-cli';
type Selection = { source?: 'existing' | 'managed'; existingPath?: string; managed?: FusedCLIInstallation & { sha256: string } };
export function compatibleFusedVersion(output: string): string | undefined {
  // 0.29 is the CLI family verified against Dextana's login/token JSON contract.
  return /^fused-cli version (0\.29\.\d+)\s*$/.exec(output.trim())?.[1];
}
export function verifyFusedArchive(bytes: Buffer, sha256: string) {
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error('Download verification failed. Nothing was installed. Please retry.');
}
export class FusedCLIInstall {
  private root: string;
  private state: FusedCLIStatus = { phase: 'idle', recommendedVersion: pinned.version, supported: !!this.asset() };
  private selection: Selection = {};
  private checking?: Promise<FusedCLIStatus>;
  private installing?: Promise<FusedCLIStatus>;
  private controller?: AbortController;
  constructor(directory: string) { this.root = join(directory, 'fused-cli'); }
  private asset() { return pinned.assets[`${process.platform}-${process.arch}` as keyof typeof pinned.assets]; }
  status(): FusedCLIStatus { return structuredClone(this.state); }
  private async probe(path: string): Promise<FusedCLIInstallation | undefined> {
    try {
      await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const { stdout } = await run(path, ['--version'], { cwd: this.root, timeout: 5000, maxBuffer: 8192, windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: process.env.HOME, XDG_CONFIG_HOME: join(this.root, 'probe'), CI: 'true', FUSED_NO_UPDATE_CHECK: '1' } });
      const version = compatibleFusedVersion(stdout);
      return { path, version: version ?? 'Unsupported version', compatible: !!version };
    } catch { return undefined; }
  }
  async check(): Promise<FusedCLIStatus> {
    if (this.installing) return this.status();
    this.checking ??= this.inspect().finally(() => { this.checking = undefined; });
    return this.checking;
  }
  private async inspect(): Promise<FusedCLIStatus> {
    this.state = { ...this.state, phase: 'checking', error: undefined, message: undefined, active: undefined, existing: undefined, managed: undefined };
    try { this.selection = JSON.parse(await readFile(join(this.root, 'selection.json'), 'utf8')); } catch { this.selection = {}; }
    if (!this.selection || typeof this.selection !== 'object' || Array.isArray(this.selection)) this.selection = {};
    const candidate = this.selection.managed;
    if (candidate?.directory && /^version-[0-9a-f-]+$/.test(candidate.directory)) {
      const path = join(this.root, candidate.directory, executable);
      try {
        const file = await lstat(path);
        if (!file.isFile() || file.isSymbolicLink() || file.size > 100_000_000) throw new Error();
        verifyFusedArchive(await readFile(path), candidate.sha256);
        const found = await this.probe(path);
        if (found?.compatible) this.state.managed = { ...found, directory: candidate.directory };
      } catch { /* Offer reinstall if the private binary was removed or changed. */ }
    }
    const paths = [...new Set([
      ...(typeof this.selection.existingPath === 'string' && isAbsolute(this.selection.existingPath) ? [this.selection.existingPath] : []),
      ...(process.env.PATH ?? '').split(delimiter).filter(isAbsolute).map(folder => join(folder, executable)),
    ])].slice(0, 50);
    for (const path of paths) {
      const found = await this.probe(path);
      if (found) { this.state.existing = found; break; }
    }
    const preferred = ['managed', 'existing'].includes(this.selection.source ?? '') ? this.selection.source! : (this.state.managed ? 'managed' : 'existing');
    if (this.state[preferred]?.compatible) this.state.active = preferred;
    this.state.phase = this.state.active ? 'ready' : 'idle';
    return this.status();
  }
  private async save(selection: Selection) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = join(this.root, `.selection-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(selection), { mode: 0o600 });
      await rename(temporary, join(this.root, 'selection.json'));
      this.selection = selection;
    } finally { await rm(temporary, { force: true }); }
  }
  async useFile(path: string): Promise<FusedCLIStatus> {
    if (this.installing) throw new Error('Wait for the installation to finish.');
    if (!isAbsolute(path)) throw new Error('Choose an installed Fused CLI.');
    await this.check();
    const found = await this.probe(path);
    if (!found?.compatible) throw new Error('That file is not a compatible Fused CLI. Install for Dextana instead.');
    await this.save({ ...this.selection, source: 'existing', existingPath: path });
    return this.check();
  }
  async useExisting(): Promise<FusedCLIStatus> {
    if (this.installing) throw new Error('Wait for the installation to finish.');
    await this.check();
    if (!this.state.existing?.compatible) throw new Error('No compatible installation found. Install for Dextana instead.');
    await this.save({ ...this.selection, source: 'existing', existingPath: this.state.existing.path });
    return this.check();
  }
  async useManaged(): Promise<FusedCLIStatus> {
    if (this.installing) throw new Error('Wait for the installation to finish.');
    await this.check();
    if (!this.state.managed?.compatible) throw new Error('Install for Dextana first.');
    await this.save({ ...this.selection, source: 'managed' });
    return this.check();
  }
  async resolve(): Promise<string> {
    if (this.installing) throw new Error('Fused CLI is being installed. Please wait.');
    const state = await this.check();
    if (!state.active) throw new Error('Set up the Fused CLI in Settings → Connectors → Fused. You can install it for Dextana with one click.');
    return state[state.active]!.path;
  }
  cancel() { if (this.state.phase === 'downloading') this.controller?.abort(); }
  async stop() { this.controller?.abort(); await this.installing; }
  install(): Promise<FusedCLIStatus> {
    this.installing ??= this.performInstall().finally(() => { this.installing = undefined; });
    return this.installing;
  }
  private async performInstall(): Promise<FusedCLIStatus> {
    await this.checking;
    const asset = this.asset();
    if (!asset) { this.state.phase = 'error'; this.state.error = 'Installation is not available for this computer. Use an existing compatible CLI.'; return this.status(); }
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(new Error('Download timed out. Please retry.')), 180_000);
    let stage = ''; let destination = ''; let committed = false;
    this.state = { ...this.state, phase: 'downloading', downloaded: 0, total: asset.bytes, error: undefined, message: undefined };
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      stage = await mkdtemp(join(this.root, '.install-'));
      let url: string = asset.url;
      let response: Response | undefined;
      for (let redirect = 0; redirect < 5; redirect++) {
        const address = new URL(url);
        if (address.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(address.hostname)) throw new Error('The download redirected to an unrecognized address.');
        response = await fetch(url, { redirect: 'manual', signal: controller.signal });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location) throw new Error('The release download is unavailable.');
        url = new URL(location, url).href;
      }
      if (!response?.ok || !response.body) throw new Error('Could not download the Fused CLI. Check your connection and retry.');
      const chunks: Buffer[] = []; let received = 0;
      for await (const chunk of response.body as any) {
        controller.signal.throwIfAborted(); received += chunk.length;
        if (received > 32_000_000) throw new Error('Download verification failed: unexpected file size.');
        chunks.push(Buffer.from(chunk)); this.state.downloaded = received;
      }
      this.state.phase = 'verifying';
      const bytes = Buffer.concat(chunks);
      verifyFusedArchive(bytes, asset.sha256);
      controller.signal.throwIfAborted();
      this.state.phase = 'installing';
      const binary = join(stage, executable);
      if (asset.format === 'zip') {
        const entry = new AdmZip(bytes).getEntry(executable);
        if (!entry || entry.isDirectory || entry.header.size > 100_000_000) throw new Error('The release does not contain the expected CLI.');
        await writeFile(binary, entry.getData(), { mode: 0o700 });
      } else {
        const archive = join(stage, 'download.tar.gz');
        await writeFile(archive, bytes, { mode: 0o600 });
        await run('/usr/bin/tar', ['-xzf', archive, '-C', stage, executable], { timeout: 30_000, signal: controller.signal });
        await rm(archive);
      }
      const file = await lstat(binary);
      if (!file.isFile() || file.isSymbolicLink() || file.size > 100_000_000) throw new Error('The release contains an invalid CLI.');
      await chmod(binary, 0o700);
      const installed = await this.probe(binary);
      if (installed?.version !== pinned.version) throw new Error('The downloaded CLI did not pass its compatibility check.');
      controller.signal.throwIfAborted();
      const directory = `version-${randomUUID()}`;
      destination = join(this.root, directory);
      const sha256 = createHash('sha256').update(await readFile(binary)).digest('hex');
      await rename(stage, destination); stage = '';
      const managed = { ...installed, path: join(destination, executable), directory, sha256 };
      await this.save({ ...this.selection, source: 'managed', managed });
      committed = true;
      this.state = { ...this.state, phase: 'ready', active: 'managed', managed, message: 'Fused CLI installed. You can sign in now.' };
    } catch (error) {
      this.state.phase = controller.signal.aborted && !controller.signal.reason?.message?.includes('timed out') ? 'idle' : 'error';
      if (this.state.phase === 'idle') this.state.message = 'Installation cancelled. Nothing was changed.';
      else this.state.error = error instanceof Error ? error.message : 'Installation failed. Please retry.';
    } finally {
      clearTimeout(timer); this.controller = undefined;
      if (stage) await rm(stage, { recursive: true, force: true });
      if (destination && !committed) await rm(destination, { recursive: true, force: true });
    }
    return this.status();
  }
}
