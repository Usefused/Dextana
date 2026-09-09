import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('custom model headers and body authenticate discovery, embeddings and chat across restart', async () => {
  test.setTimeout(120000);
  const headerKey = 'fixture-custom-header-secret',
    bodyKey = 'fixture-custom-body-secret';
  const calls: { path: string; auth?: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    calls.push({ path: req.url!, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (
      req.headers.authorization ||
      req.headers['x-api-key'] !== headerKey ||
      req.headers['x-tenant'] !== 'tenant-one'
    ) {
      res.writeHead(401);
      return res.end('{}');
    }
    if (req.url === '/v1/models')
      return res.end(
        JSON.stringify({ data: [{ id: 'chat' }, { id: 'vectors', task: 'feature-extraction' }] }),
      );
    if (body.credentials?.token !== bodyKey) {
      res.writeHead(401);
      return res.end('{}');
    }
    if (req.url === '/v1/embeddings')
      return res.end(
        JSON.stringify({
          data: body.input.map((_: string, index: number) => ({ index, embedding: [1, 2, 3] })),
        }),
      );
    if (req.url === '/v1/chat/completions') {
      if (body.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.write(
          `data: ${JSON.stringify({ id: 'auth-test', object: 'chat.completion.chunk', created: 1, model: 'chat', choices: [{ index: 0, delta: { role: 'assistant', content: 'Custom authentication works.' }, finish_reason: null }] })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ id: 'auth-test', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
        );
        return res.end('data: [DONE]\n\n');
      }
      return res.end(
        JSON.stringify({
          id: 'auth-test',
          object: 'chat.completion',
          created: 1,
          model: 'chat',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Custom authentication works.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
      );
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  const directory = await mkdtemp(join(tmpdir(), 'dext-auth-'));
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, DEXTANA_USER_DATA: directory } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Provider', { exact: true }).selectOption('openai');
    await page.getByLabel('Base URL').fill(base);
    await page.getByLabel('Authentication', { exact: true }).selectOption('custom');
    await page
      .getByLabel('Request headers (JSON)', { exact: true })
      .fill(JSON.stringify({ 'X-API-Key': headerKey, 'X-Tenant': 'tenant-one' }));
    await page
      .getByLabel('Authentication body fields (JSON)', { exact: true })
      .fill(JSON.stringify({ credentials: { token: bodyKey } }));
    await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
    await expect(page.getByText('1 models available')).toBeVisible();
    await page.getByLabel('Embedding model', { exact: true }).selectOption('model:vectors');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByLabel('Describe your work')).toBeVisible();
    await page.getByLabel('Describe your work').fill('Test custom authentication');
    await page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Custom authentication works.',
      { timeout: 60000 },
    );
    const snapshot = await page.evaluate(() => window.dextana.snapshot());
    expect(snapshot.settings.embeddingDimensions).toBe(3);
    expect(snapshot.settings.authMode).toBe('custom');
    expect(JSON.stringify(snapshot)).not.toContain(headerKey);
    expect(JSON.stringify(snapshot)).not.toContain(bodyKey);
    await app.close();
    const sensitiveFiles = [
      'state.json',
      ...(await readdir(join(directory, 'model-connections'))).map(
        (name) => `model-connections/${name}`,
      ),
      ...(await readdir(join(directory, 'agent-state')))
        .filter((name) => /sqlite(?:-wal)?$/.test(name))
        .map((name) => `agent-state/${name}`),
    ];
    for (const name of sensitiveFiles) {
      const bytes = await readFile(join(directory, name));
      expect(bytes.includes(Buffer.from(headerKey)), name).toBe(false);
      expect(bytes.includes(Buffer.from(bodyKey)), name).toBe(false);
    }
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Authentication', { exact: true })).toHaveValue('custom');
    await page.getByRole('button', { name: 'Fetch models', exact: true }).click();
    await expect(page.getByText('1 models available')).toBeVisible();
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByLabel('Describe your work').fill('Test after restart');
    await page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(page.getByTestId('assistant-message')).toContainText(
      'Custom authentication works.',
      { timeout: 60000 },
    );
    expect(calls.some((call) => call.path === '/v1/embeddings')).toBe(true);
    expect(
      calls
        .filter((call) => call.path === '/v1/chat/completions')
        .every((call) => call.body.credentials.token === bodyKey && !call.auth),
    ).toBe(true);
  } finally {
    await app.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
