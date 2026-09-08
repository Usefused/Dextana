import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

export class Runtime {
  constructor(private backendRoot = join(__dirname, '../.build/backend'), private workingDirectory = process.cwd()) {}
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
          DEXTANA_SCHEDULER_DIRECTORY: this.workingDirectory,
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
      try {
        const response = await this.request('/agent', { signal: AbortSignal.timeout(500) });
        if (response.ok) return;
      } catch {
        /* Runtime is still starting. */
      }
      await delay(250);
    }
    this.stop();
    throw new Error(
      'The built-in agent took too long to start. Restart Dextana and try again.',
    );
  }
  request(path: string, init: RequestInit = {}) {
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
  async stream(
    sessionId: string,
    input: string,
    metadata: Record<string, string>,
    signal: AbortSignal,
    consume: (event: any) => void,
    execute: (tool: any) => Promise<unknown>,
    decideApproval?: (event: any) => Promise<boolean>,
  ): Promise<any> {
    signal.throwIfAborted();
    const socket = new WebSocket(this.url.replace(/^http/, 'ws') + '/live', {
      headers: { Authorization: `Bearer ${this.token}` },
      maxPayload: 2_000_000,
      handshakeTimeout: 10_000,
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      let responseId: string | undefined;
      let sequence = Promise.resolve();
      const finish = (error?: Error, result?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', abort);
        if (socket.readyState === WebSocket.OPEN) socket.close();
        else socket.terminate();
        if (error) reject(error);
        else resolve(result);
      };
      const abort = () => {
        if (responseId && socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: 'response.cancel', responseId }));
        finish(signal.reason instanceof Error ? signal.reason : new Error('Activity cancelled.'));
      };
      signal.addEventListener('abort', abort, { once: true });
      socket.on('open', () => socket.send(JSON.stringify({ type: 'connect', sessionId })));
      socket.on('error', (error) => finish(error));
      socket.on('close', () => {
        sequence = sequence.then(() =>
          finish(new Error('The connection ended before the agent completed.')),
        );
      });
      socket.on('message', (data) => {
        sequence = sequence
          .then(async () => {
            if (settled) return;
            signal.throwIfAborted();
            const event = JSON.parse(data.toString());
            if (event.type === 'session.connected') {
              socket.send(JSON.stringify({ type: 'response.create', input, metadata }));
              return;
            }
            if (event.type === 'response.created') responseId = event.responseId;
            consume(event);
            if (event.type === 'error' || event.type === 'response.failed')
              throw new Error(
                event.error?.message ?? event.error ?? event.message ?? 'Agent execution failed.',
              );
            if (event.type === 'client_tool.requested') {
              const output = await execute(event.clientTool);
              signal.throwIfAborted();
              if (!settled)
                socket.send(
                  JSON.stringify({
                    type: 'client_tool.result',
                    requestId: event.clientTool.id,
                    output,
                  }),
                );
            }
            if (event.type === 'approval.requested') {
              if (!decideApproval) throw new Error('This runtime approval is unsupported.');
              const approved = await decideApproval(event);
              signal.throwIfAborted();
              if (!settled) socket.send(JSON.stringify({ type: 'approval.decision', responseId: event.responseId, approvalId: event.approval.id, decision: approved ? 'approve' : 'deny' }));
            }
            if (event.type === 'response.completed' && event.status !== 'requires_action')
              finish(undefined, event);
          })
          .catch((error) => finish(error));
      });
      if (signal.aborted) abort();
    });
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
