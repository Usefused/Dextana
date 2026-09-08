import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

test('Harnest rejects unauthenticated callers and accepts only the desktop owner token', async () => {
  test.setTimeout(90_000);
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const child = spawn('harnest', ['serve', 'agent', '--port', String(port)], {
    env: {
      ...process.env,
      DEXTANA_RUNTIME_TOKEN: 'synthetic-owner-test',
      LITELLM_LOCAL_MODEL_COST_MAP: 'True',
    },
    stdio: 'ignore',
    detached: process.platform !== 'win32',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await expect
      .poll(
        async () => {
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
  } finally {
    if (child.pid) {
      if (process.platform === 'win32') child.kill();
      else process.kill(-child.pid, 'SIGTERM');
    }
  }
});
