import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('stopping desktop from the terminal releases its backend and allows the same workspace to restart', async () => {
  test.skip(process.platform === 'win32', 'Unix terminal signals and process groups');
  test.setTimeout(60_000);
  const directory = await mkdtemp(join(tmpdir(), 'dextana-shutdown-'));
  let app: ElectronApplication | undefined;
  const backendPids: number[] = [];
  const alive = (pid: number) => {
    try { process.kill(pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  };
  const launch = async () => {
    app = await electron.launch({ args: ['.'], env: { ...process.env, DEXTANA_USER_DATA: directory } });
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    const parentPid = app.process().pid!;
    const child = execFileSync('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' })
      .split('\n').map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
      .find(row => row && Number(row[2]) === parentPid && row[3].includes('harnest-agent'));
    expect(child).toBeTruthy();
    const backendPid = Number(child![1]);
    backendPids.push(backendPid);
    return backendPid;
  };
  try {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const backendPid = await launch();
      const desktop = app!.process();
      desktop.kill(signal);
      await expect.poll(() => desktop.exitCode !== null || desktop.signalCode !== null).toBe(true);
      await expect.poll(() => alive(backendPid), { timeout: 10_000 }).toBe(false);
    }
    await launch();
  } finally {
    if (app && app.process().exitCode === null && app.process().signalCode === null) await app.close();
    for (const pid of backendPids) if (alive(pid)) process.kill(pid, 'SIGTERM');
    await expect.poll(() => backendPids.some(alive), { timeout: 10_000 }).toBe(false);
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('compiled backend rejects unauthenticated callers and accepts only the desktop owner token', async () => {
  test.setTimeout(90_000);
  const directory = await mkdtemp(join(tmpdir(), 'dextana-auth-'));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const model = httpServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text || '{}');
    if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion', 'tools'], model_info: {}, template: '' }));
    const last = body.messages?.findLastIndex((message: any) => message.role === 'user') ?? -1;
    const prompt = body.messages?.[last]?.content ?? '';
    const results = body.messages?.slice(last + 1).filter((message: any) => message.role === 'tool') ?? [];
    const message = prompt.includes('Delegate headless') && !results.length
      ? { role: 'assistant', content: '', tool_calls: [{ function: { name: 'delegate', arguments: { tasks: [{ prompt: 'Headless worker one' }, { prompt: 'Headless worker two' }] } } }] }
      : { role: 'assistant', content: 'Headless backend completed' };
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(JSON.stringify({ model: body.model, created_at: new Date().toISOString(), message, done: true }) + '\n');
  });
  await new Promise<void>(resolve => model.listen(0, '127.0.0.1', resolve));
  const modelUrl = `http://127.0.0.1:${(model.address() as { port: number }).port}`;
  const backend = resolve('.build/backend');
  const child = spawn(
    join(backend, 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3'),
    [
      '-I',
      '-B',
      join(backend, 'agent/harnest-agent'),
      'serve',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: directory,
      env: {
        ...process.env,
        PATH:
          process.platform === 'win32' ? process.env.SystemRoot + '\\System32' : '/usr/bin:/bin',
        DEXTANA_RUNTIME_TOKEN: 'synthetic-owner-test',
        DEXTANA_RUNTIME_URL: `http://127.0.0.1:${port}`,
        DEXTANA_STORAGE_DIRECTORY: join(directory, 'agent-state'),
        DEXTANA_SCHEDULER_DIRECTORY: directory,
        LITELLM_LOCAL_MODEL_COST_MAP: 'True',
      },
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    },
  );
  let failed = '';
  const exited = new Promise<void>((resolve) => {
    child.once('error', (error) => {
      failed = error.message;
      resolve();
    });
    child.once('exit', (code, signal) => {
      failed = `Backend exited (${code ?? signal})`;
      resolve();
    });
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await expect
      .poll(
        async () => {
          if (failed) return failed;
          try {
            return (
              await fetch(base + '/agent', {
                headers: { Authorization: 'Bearer synthetic-owner-test' },
                signal: AbortSignal.timeout(500),
              })
            ).status;
          } catch {
            return 0;
          }
        },
        { timeout: 60_000 },
      )
      .toBe(200);
    expect((await fetch(base + '/sessions')).status).toBe(401);
    expect(
      (await fetch(base + '/sessions', { headers: { Authorization: 'Bearer wrong-token' } }))
        .status,
    ).toBe(401);
    const created = await fetch(base + '/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-owner-test', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(created.status).toBe(201);
    for (const path of ['/dextana/activity/events', '/dextana/jobs']) expect((await fetch(base + path)).status).toBe(401);
    for (const path of ['/dextana/activity/command', '/dextana/mcp/open']) expect((await fetch(base + path, { method: 'POST', body: '{}' })).status).toBe(401);
    const request = async (path: string, data?: unknown) => {
      const response = await fetch(base + path, { headers: { Authorization: 'Bearer synthetic-owner-test', 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }) });
      expect(response.ok).toBe(true);
      return response.json();
    };
    await request('/dextana/activity/command', { action: 'initialize', settings: { models: ['test'], defaultModel: 'test', ollamaUrl: modelUrl } });
    const first = await request('/dextana/activity/command', { action: 'start', input: { prompt: 'Delegate headless work', model: 'test' } });
    await request('/dextana/activity/command', { action: 'start', input: { activityId: first.result, prompt: 'Queued headless follow-up', model: 'test' } });
    await expect.poll(async () => {
      const state = await request('/dextana/activity/events');
      const parent = state.activities.find((a: any) => a.id === first.result);
      return { status: parent.status, replies: parent.messages.filter((m: any) => m.role === 'assistant').length, workers: state.activities.filter((a: any) => a.parentId === first.result && a.status === 'completed').length };
    }, { timeout: 30_000 }).toEqual({ status: 'completed', replies: 2, workers: 2 });
    const jobId = await request('/dextana/jobs', { name: 'Headless schedule', prompt: 'Scheduled headless work', model: 'test', expression: '0 0 * * *', timezone: 'Europe/London', enabled: false });
    await request(`/dextana/jobs/${jobId}/run`, {});
    // No Electron process or desktop dispatch/report loop exists in this test.
    await expect.poll(async () => (await request('/dextana/jobs')).find((job: any) => job.id === jobId)?.runs[0]?.status, { timeout: 15_000 }).toBe('completed');
  } finally {
    let forced: ReturnType<typeof setTimeout> | undefined;
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const stop = (signal: NodeJS.Signals) => {
        try {
          if (process.platform === 'win32') child.kill(signal);
          else process.kill(-child.pid!, signal);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      };
      stop('SIGTERM');
      forced = setTimeout(() => stop('SIGKILL'), 5000);
    }
    await exited;
    model.closeAllConnections();
    await new Promise<void>(resolve => model.close(() => resolve()));
    clearTimeout(forced);
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
