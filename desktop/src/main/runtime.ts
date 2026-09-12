import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export class Runtime {
  constructor(private backendRoot = join(__dirname, '../.build/backend'), private workingDirectory = process.cwd()) {}
  onReady?: () => Promise<void>;
  private process?: ChildProcess;
  private ready?: Promise<void>;
  private url = '';
  private token = randomBytes(32).toString('hex');
  private stopped = false;
  async ensure() {
    this.ready ??= this.launch().catch((error) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }
  private async launch() {
    if (this.stopped) throw new Error('Runtime is shutting down.');
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', resolve);
    });
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    this.url = `http://127.0.0.1:${port}`;
    let failure = '';
    const python = join(this.backendRoot, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
    const launcher = join(this.backendRoot, 'agent/harnest-agent');
    if (!existsSync(python) || !existsSync(launcher)) throw new Error('The built-in agent is missing. Reinstall Dextana, or run npm run backend:build when developing.');
    const child = spawn(
      python,
      ['-I', '-B', launcher, 'serve', '--host', '127.0.0.1', '--port', String(port)],
      {
        cwd: this.workingDirectory,
        env: {
          ...process.env,
          PYTHONDONTWRITEBYTECODE: '1',
          DEXTANA_RUNTIME_TOKEN: this.token,
          DEXTANA_RUNTIME_URL: this.url,
          DEXTANA_STORAGE_DIRECTORY: join(this.workingDirectory, 'agent-state'),
          DEXTANA_SCHEDULER_DIRECTORY: this.workingDirectory,
          DEXTANA_TIMEZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
          LITELLM_LOCAL_MODEL_COST_MAP: 'True',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      },
    );
    this.process = child;
    child.on('error', () => {
      failure = 'The built-in agent could not start. Restart Dextana or reinstall the app.';
    });
    child.stdout?.resume();
    child.stderr?.resume();
    child.on('exit', () => {
      failure ||= 'The built-in agent stopped. Restart Dextana to try again.';
      this.ready = undefined;
    });
    for (let attempt = 0; attempt < 240; attempt++) {
      if (failure) throw new Error(failure);
      if (this.stopped) throw new Error('Runtime is shutting down.');
      let available = false;
      try {
        const response = await this.request('/agent', { signal: AbortSignal.timeout(500) });
        available = response.ok;
      } catch {
        /* Runtime is still starting. */
      }
      if (available) { await this.onReady?.(); return; }
      await delay(250);
    }
    this.stop();
    throw new Error(
      'The built-in agent took too long to start. Restart Dextana and try again.',
    );
  }
  request(path: string, init: RequestInit = {}) {
    if (this.stopped) return Promise.reject(new Error('Agent is restarting or shutting down.'));
    return fetch(this.url + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...init.headers,
      },
      redirect: 'error',
    });
  }
  async rebuild(build: () => Promise<void>) {
    const child = this.process;
    this.stop();
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          child.removeListener('exit', exited);
          reject(new Error('Agent did not stop. Restart Dext before rebuilding.'));
        }, 10_000);
        const exited = () => { clearTimeout(timer); resolve(); };
        child.once('exit', exited);
      });
    }
    this.process = undefined;
    this.ready = undefined;
    try {
      await build();
    } finally {
      // A failed staging build leaves the previous bundle available.
      this.stopped = false;
      this.token = randomBytes(32).toString('hex');
      await this.ensure();
    }
  }
  stop() {
    this.stopped = true;
    if (this.process?.pid) {
      try {
        if (process.platform === 'win32') this.process.kill();
        else process.kill(-this.process.pid, 'SIGTERM');
      } catch {
        /* Already exited. */
      }
    }
  }
}

export async function readSSE(response: Response, consume: (event: any) => Promise<void>) {
  if (!response.ok) throw new Error(`Harnest returned HTTP ${response.status}.`);
  if (!response.body) throw new Error('Harnest returned an empty stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      pending = pending.replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data && data !== '[DONE]') await consume(JSON.parse(data));
      }
      if (pending.length > 2_000_000)
        throw new Error('Harnest stream frame exceeded the size limit.');
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
