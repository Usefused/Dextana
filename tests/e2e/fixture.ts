import {
  test as base,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Responder = (body: any, response: ServerResponse) => boolean;

// One real Electron/Harnest workspace per Playwright worker. Each test installs its own
// provider responder and creates new chats through start(); transcripts are not erased.
async function launchDesktop() {
  let responder: Responder | undefined;
  let contextWindow: number | undefined = 32768;
  const calls: any[] = [];
  const responses = new Set<ServerResponse>();
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    responses.add(res);
    res.once('close', () => responses.delete(res));
    if (req.url === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:3b' }] }));
    let data = '';
    for await (const chunk of req) data += chunk;
    const body = JSON.parse(data || '{}');
    if (req.url === '/api/show')
      return res.end(
        JSON.stringify({ capabilities: ['completion', 'tools', 'thinking', ...(body.model === 'qwen3:8b' ? ['vision'] : [])], model_info: {}, ...(contextWindow === undefined ? {} : { parameters: `num_ctx ${contextWindow}` }), template: '' }),
      );
    if (req.url !== '/api/chat') {
      res.writeHead(404);
      return res.end();
    }
    calls.push(body);
    if (responder?.(body, res)) return;
    const input = body.messages.filter((m: any) => m.role === 'user').at(-1)?.content ?? '';
    if (input.includes('Wait until cancelled')) {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write('\n');
      return;
    }
    const answer = input.includes('Follow up')
      ? `Follow-up with ${body.messages.length} messages of context.`
      : `Completed by ${body.model}: ${input}`;
    const timer = setTimeout(
      () => {
        if (!res.destroyed) reply(body, res, answer);
      },
      input.includes('Slow work') ? 1500 : 50,
    );
    res.once('close', () => clearTimeout(timer));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const directory = await mkdtemp(join(tmpdir(), 'dextana-work-'));
  let app: ElectronApplication;
  async function launch() {
    app = await electron.launch({
      args: ['.'],
      env: { ...process.env, DEXTANA_USER_DATA: directory, LITELLM_LOCAL_MODEL_COST_MAP: 'True' },
    });
    const page = await app.firstWindow();
    page.on('pageerror', (error) => console.error(error));
    return page;
  }
  let page = await launch();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Ollama address').fill(`http://127.0.0.1:${port}`);
  await page.getByRole('button', { name: 'Connect to Ollama' }).click();
  await expect(page.getByText('2 models available')).toBeVisible();
  await page.getByRole('button', { name: 'Save settings' }).click();
  const resetView = async () => {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1320, 880),
    );
    const back = page.getByRole('button', { name: 'Back to chats' });
    if (await back.isVisible()) await back.click();
    await page.getByLabel('Workspace view').selectOption('activities');
    await page.getByRole('button', { name: 'New activity', exact: true }).click();
    await page.getByLabel('Describe your work').fill('');
  };
  return {
    resetView,
    get page() {
      return page;
    },
    calls,
    directory,
    port,
    app: () => app,
    setResponder: (value?: Responder) => {
      responder = value;
    },
    setContextWindow: (value: number | undefined) => {
      contextWindow = value;
    },
    stopResponses: () => {
      for (const response of responses) response.destroy();
    },
    restart: async (beforeLaunch?: () => Promise<void>) => {
      await app.close();
      await beforeLaunch?.();
      page = await launch();
      return page;
    },
    close: async () => {
      await app.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      // Chromium/backend shutdown may finish a final profile write after quit.
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}

export type Desktop = Awaited<ReturnType<typeof launchDesktop>>;
export const test = base.extend<
  {
    workspace: (responder?: Responder) => Promise<Desktop>;
  },
  { desktop: Desktop }
>({
  desktop: [
    async ({}, use) => {
      const desktop = await launchDesktop();
      try {
        await use(desktop);
      } finally {
        await desktop.close();
      }
    },
    { scope: 'worker', timeout: 120_000 },
  ],
  workspace: async ({ desktop }, use, testInfo) => {
    let opened = false;
    let released = false;
    let tracing = false;
    const traces: string[] = [];
    const beginTrace = async () => {
      await desktop
        .app()
        .context()
        .tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
      testInfo.annotations.push({
        type: 'desktop-instance',
        description: JSON.stringify({
          pid: desktop.app().process().pid,
          workspace: desktop.directory,
        }),
      });
    };
    const endTrace = async () => {
      if (!tracing) return;
      tracing = false;
      const path = testInfo.outputPath(`desktop-trace-${traces.length + 1}.zip`);
      await desktop.app().context().tracing.stop({ path });
      traces.push(path);
    };
    const release = async () => {
      if (!opened || released) return;
      released = true;
      // Teardown only: cancel leftover work through the real public bridge, then
      // close held provider responses before another test installs its responder.
      try {
        await desktop.page.evaluate(async () => {
          const snapshot = await window.dextana.snapshot();
          for (const activity of snapshot.activities)
            if (['starting', 'running'].includes(activity.status))
              await window.dextana.cancel(activity.id);
        });
      } finally {
        desktop.stopResponses();
        desktop.setResponder();
      }
    };
    try {
      await use(async (responder) => {
        if (opened)
          throw new Error('Use one workspace per test and start a new chat for each flow.');
        opened = true;
        desktop.calls.length = 0;
        desktop.setResponder(responder);
        await beginTrace();
        await desktop.resetView();
        return {
          ...desktop,
          get page() {
            return desktop.page;
          },
          restart: async (beforeLaunch?: () => Promise<void>) => {
            await endTrace();
            const page = await desktop.restart(beforeLaunch);
            await beginTrace();
            return page;
          },
          // Existing scenarios close their scope, never the shared app.
          close: release,
        };
      });
    } finally {
      try {
        await release();
      } finally {
        await endTrace();
        for (const path of traces) {
          if (testInfo.status !== testInfo.expectedStatus)
            await testInfo.attach('desktop trace', { path, contentType: 'application/zip' });
          else await rm(path, { force: true });
        }
      }
    }
  },
});
export function reply(body: any, res: ServerResponse, content: string, toolCalls?: any[]) {
  const message = { role: 'assistant', content, ...(toolCalls ? { tool_calls: toolCalls } : {}) };
  const common = { model: body.model, created_at: new Date().toISOString() };
  if (body.stream) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.write(JSON.stringify({ ...common, message, done: false }) + '\n');
    res.end(
      JSON.stringify({
        ...common,
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: toolCalls ? 'stop' : 'stop',
        total_duration: 1,
        prompt_eval_count: 10,
        eval_count: 5,
      }) + '\n',
    );
  } else
    res.end(
      JSON.stringify({ ...common, message, done: true, prompt_eval_count: 10, eval_count: 5 }),
    );
}
export async function start(page: Page, prompt: string, model?: string) {
  const back = page.getByRole('button', { name: 'Back to chats' });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: 'New activity', exact: true }).click();
  if (model) {
    await page.getByRole('button', { name: 'Model and reasoning', exact: true }).click();
    await page.getByRole('combobox', { name: 'Activity model', exact: true }).fill(model);
    await page.getByRole('combobox', { name: 'Activity model', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Model and reasoning', exact: true }).click();
  }
  await page.getByLabel('Describe your work').fill(prompt);
  await page.getByRole('button', { name: 'Start activity' }).click();
}

// Browser flows opt in through the same approval UI as the owner. Approval-specific
// specs leave the default gate in place and assert that no action runs before consent.
export async function allowBrowser(page: Page) {
  const gate = page.getByRole('region', { name: 'Action approval' });
  await expect(gate).toBeVisible({ timeout: 60_000 });
  await gate.getByRole('button', { name: 'Allow all', exact: true }).click();
}
