import { FUSED_TOKEN_LIFETIME, FUSED_TOKEN_LIFETIME_MS } from '../shared/fused-token';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { endpoint } from './settings';
import type { Store } from './store';
import type { FusedServer } from '../shared/types';

export interface FusedToken { token: string; name: string; expiresAt: number; engine: string; mcpId: string }
export function parseFusedToken(value: unknown, mcpId: string, name: string, operations: string[]): FusedToken {
  const item = value as Record<string, unknown>;
  const expectedOperations = operations.length ? operations : ['*'];
  const expiry = typeof item?.expires_at === 'string' ? Date.parse(item.expires_at) : NaN;
  if (!item || item.app_family_id !== mcpId || item.name !== name || typeof item.id !== 'string' || !item.id || typeof item.token !== 'string' || !item.token || item.token.length > 16000 || /[\r\n]/.test(item.token) || !Array.isArray(item.allow) || item.allow.length !== expectedOperations.length || !expectedOperations.every(operation => item.allow instanceof Array && item.allow.includes(operation)) || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + FUSED_TOKEN_LIFETIME_MS + 30_000) throw new Error('Invalid Fused token response.');
  return { token: item.token, name, expiresAt: expiry, engine: '', mcpId };
}

export function fusedEnvironment(config: string) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('FUSED_')) delete env[key];
  return { ...env, XDG_CONFIG_HOME: config, FUSED_NO_UPDATE_CHECK: '1', CI: 'true' };
}
export function parseFusedServers(
  value: unknown,
  engine: string,
): { servers: FusedServer[]; total: number } {
  const page = value as { items?: any[]; total?: number };
  if (!Array.isArray(page?.items) || !Number.isSafeInteger(page.total) || page.total! < 0)
    throw new Error('Unsupported Fused MCP list JSON. Update fused-cli.');
  const servers: FusedServer[] = [];
  for (const item of page.items) {
    if (String(item.status).toLowerCase() !== 'active') continue;
    if (
      ![item.app_family_id, item.app_id, item.name, item.version].every(
        (v) => typeof v === 'string' && v.length > 0 && v.length < 300,
      )
    )
      throw new Error('Incomplete MCP identity in Fused discovery.');
    const url = endpoint(item.transport_urls?.versioned_streamable_http);
    if (new URL(url).origin !== new URL(engine).origin)
      throw new Error('Fused returned an MCP endpoint outside the connected Engine.');
    servers.push({
      id: item.app_id,
      mcpId: item.app_family_id,
      name: item.name,
      version: item.version,
      url,
    });
  }
  return { servers, total: page.total! };
}
class FusedCLIUnavailable extends Error {
  constructor() { super('Install fused-cli and make it available on PATH, then reopen Dextana to connect Fused.'); }
}

export class FusedCLI {
  private active?: AbortController;
  private idle: Promise<void> = Promise.resolve();
  async initialize() {
    const root = join(this.directory, 'fused-workspace');
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(root))
      if (entry.startsWith('.cli-')) await rm(join(root, entry), { recursive: true, force: true });
  }
  async stop() {
    this.cancel();
    await this.idle;
  }
  constructor(
    private store: Store,
    private directory: string,
    private publish: () => void,
    private executable?: () => Promise<string>,
  ) {}
  cancel() {
    this.active?.abort();
  }
  private async session<T>(
    work: (run: (args: string[]) => Promise<string>) => Promise<T>,
    fresh = false,
    persist = true,
  ): Promise<T> {
    if (this.active) throw new Error('Fused is busy. Finish or cancel the current request.');
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error('A system keyring is required for Fused login.');
    const controller = new AbortController();
    this.active = controller;
    let finished!: () => void;
    this.idle = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const root = join(this.directory, 'fused-workspace');
    let temporary = '';
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      temporary = await mkdtemp(join(root, '.cli-'));
      const configDir = join(temporary, 'fused');
      await mkdir(configDir, { mode: 0o700 });
      if (!fresh) {
        try {
          await writeFile(
            join(configDir, 'config.json'),
            safeStorage.decryptString(await readFile(join(root, 'login.enc'))),
            { mode: 0o600 },
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      const executable = this.executable ? await this.executable() : 'fused-cli';
      const run = (args: string[]) =>
        new Promise<string>((resolve, reject) => {
          if (controller.signal.aborted) {
            reject(new Error('Fused request cancelled.'));
            return;
          }
          const child = spawn(executable, args, {
            cwd: root,
            env: fusedEnvironment(temporary),
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let output = '';
          let failed = false;
          let missing = false;
          const stop = () => {
            child.kill('SIGTERM');
            setTimeout(() => {
              if (child.exitCode === null) child.kill('SIGKILL');
            }, 1500).unref();
          };
          const timer = setTimeout(() => {
            failed = true;
            stop();
          }, 300000);
          controller.signal.addEventListener('abort', stop, { once: true });
          child.stdout.on('data', (chunk) => {
            output += chunk;
            if (Buffer.byteLength(output) > 4_000_000) {
              failed = true;
              stop();
            }
          });
          child.stderr.resume(); // Never expose CLI diagnostics that might contain credentials.
          child.on('error', (error: NodeJS.ErrnoException) => {
            missing = error.code === 'ENOENT';
            failed = true;
          });
          child.on('close', (code) => {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', stop);
            if (controller.signal.aborted) reject(new Error('Fused request cancelled.'));
            else if (missing) reject(new FusedCLIUnavailable());
            else if (code !== 0 || failed)
              reject(
                new Error(
                  'Fused CLI request failed. Check that fused-cli is installed, the Engine is reachable, and your account has permission.',
                ),
              );
            else resolve(output);
          });
        });
      const result = await work(run);
      controller.signal.throwIfAborted();
      if (!persist) return result;
      const config = await readFile(join(configDir, 'config.json'), 'utf8');
      const encrypted = safeStorage.encryptString(config);
      await writeFile(join(root, 'login.enc.tmp'), encrypted, { mode: 0o600 });
      await rename(join(root, 'login.enc.tmp'), join(root, 'login.enc'));
      return result;
    } finally {
      try {
        if (temporary) await rm(temporary, { recursive: true, force: true });
      } finally {
        this.active = undefined;
        finished();
      }
    }
  }
  async issue(engine: string, mcpId: string, operations: string[], signal: AbortSignal): Promise<FusedToken> {
    if (this.store.state.fusedWorkspace?.url !== engine || operations.some(value => !value || value.includes('*') || value.includes(','))) throw new Error('Review the Fused workspace and exact operation scope.');
    signal.throwIfAborted();
    const name = `dext-${randomUUID()}`;
    let attempted = false;
    try {
      return await this.session(async run => {
        const abort = () => this.cancel();
        signal.addEventListener('abort', abort, { once: true });
        try {
          signal.throwIfAborted();
          const identity = JSON.parse(await run(['whoami', '--json', '--engine-url', engine]));
          if (!identity || typeof identity !== 'object' || identity.ok === false) throw new Error('Fused identity unavailable.');
          attempted = true;
          const result = parseFusedToken(JSON.parse(await run(['mcp', 'token', 'generate', mcpId, name, '--json', ...(operations.length ? ['--allow', operations.join(',')] : []), '--expires-in', FUSED_TOKEN_LIFETIME, '--engine-url', engine, '--no-input'])), mcpId, name, operations);
          signal.throwIfAborted();
          return { ...result, engine };
        } finally { signal.removeEventListener('abort', abort); }
      });
    } catch (error) {
      if (error instanceof FusedCLIUnavailable && !attempted) throw error;
      if (attempted) await this.revoke({ engine, mcpId, name }).catch(() => {});
      throw new Error(attempted ? 'Fused token creation did not complete reliably. Cleanup was attempted; do not automatically retry issuance. Any issued token expires within 24 hours.' : 'Could not verify the Fused account. No token creation was attempted.');
    }
  }
  async revoke(token: Pick<FusedToken, 'engine' | 'mcpId' | 'name'>) {
    if (this.store.state.fusedWorkspace?.url !== token.engine) return;
    await this.session(run => run(['mcp', 'token', 'revoke', token.mcpId, token.name, '--engine-url', token.engine, '--no-input']));
  }
  async login(input: string) {
    const url = endpoint(input);
    if (this.store.state.fusedWorkspace && this.store.state.fusedWorkspace.url !== url)
      throw new Error('Disconnect your current Fused workspace before changing Engines.');
    await this.session(async (run) => {
      await run(['login', '--engine-url', url, '--no-input', '--timeout', '5m']);
      const identity = JSON.parse(await run(['whoami', '--json', '--engine-url', url]));
      if (!identity || typeof identity !== 'object' || identity.ok === false)
        throw new Error('Fused login did not return an identity.');
    }, !this.store.state.fusedWorkspace);
    this.store.state.fusedWorkspace = { url, connectedAt: new Date().toISOString(), servers: [] };
    await this.store.save();
    this.publish();
    await this.discover();
  }
  async discover() {
    const workspace = this.store.state.fusedWorkspace;
    if (!workspace) throw new Error('Connect your Fused workspace first.');
    const servers = await this.session(async (run) => {
      const result: FusedServer[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const raw = JSON.parse(
          await run([
            'mcp',
            'list',
            '--json',
            '--limit',
            '100',
            '--offset',
            String(offset),
            '--engine-url',
            workspace.url,
          ]),
        );
        const page = parseFusedServers(raw, workspace.url);
        result.push(...page.servers);
        if (offset + 100 >= page.total) return result;
      }
      throw new Error(
        'More than 1,000 MCP versions found. Narrow the account access before importing.',
      );
    });
    const previous = workspace.servers;
    workspace.servers = [...new Map(servers.map((server) => [server.id, server])).values()];
    try {
      await this.store.save();
    } catch (error) {
      workspace.servers = previous;
      throw error;
    }
    this.publish();
  }
  async logout() {
    const workspace = this.store.state.fusedWorkspace;
    if (!workspace) return;
    await this.session((run) => run(['logout', '--engine-url', workspace.url]), false, false);
    delete this.store.state.fusedWorkspace;
    try {
      await this.store.save();
    } catch (error) {
      this.store.state.fusedWorkspace = workspace;
      throw error;
    }
    await rm(join(this.directory, 'fused-workspace', 'login.enc'), { force: true });
    this.publish();
  }
}
