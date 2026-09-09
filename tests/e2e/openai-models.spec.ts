import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('compatible endpoint authenticates, filters embeddings, runs chat and retains encrypted key after restart', async () => {
  test.setTimeout(120_000);
  const key = 'fixture-model-key-not-a-real-secret';
  const requests: { url?: string; auth?: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    requests.push({ url: req.url, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== `Bearer ${key}`) { res.writeHead(401); res.end('{}'); return; }
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [
      { id: 'vendor/chat-model', architecture: { output_modalities: ['text'] } },
      { id: 'text-embedding-3-small' }, { id: 'vendor/vector-only', task: 'feature-extraction' },
      { id: 'vendor/opaque-vector', architecture: { output_modalities: ['embeddings'] } },
    ] }));
    if (req.url === '/v1/chat/completions') {
      const needsTools = !body.messages.some((message: any) => message.role === 'tool');
      if (body.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        const choices = needsTools ? [{ delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-skills', type: 'function', function: { name: 'list_skills', arguments: '{}' } }] }, finish_reason: null }, { delta: {}, finish_reason: 'tool_calls' }] : [{ delta: { role: 'assistant', content: 'Compatible endpoint connected.' }, finish_reason: null }, { delta: {}, finish_reason: 'stop' }];
        for (const choice of choices) res.write(`data: ${JSON.stringify({ id: 'chat-fixture', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, ...choice }] })}\n\n`);
        return res.end('data: [DONE]\n\n');
      }
      return res.end(JSON.stringify({ id: 'chat-fixture', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: 'Compatible endpoint connected.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }));
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  const directory = await mkdtemp(join(tmpdir(), 'dextana-compatible-'));
  const launch = () => electron.launch({ args: ['.'], env: { ...process.env, DEXTANA_USER_DATA: directory } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Provider', { exact: true }).selectOption('openai');
    await page.getByLabel('Base URL').fill(base);
    await page.getByLabel('API key', { exact: true }).fill(key);
    await page.getByRole('button', { name: 'Fetch models' }).click();
    await expect(page.getByText('1 models available')).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByLabel('Describe your work').fill('Say hello.');
    await page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(page.getByText('Compatible endpoint connected.', { exact: true })).toBeVisible({ timeout: 90_000 });
    const chat = requests.find(r => r.url === '/v1/chat/completions');
    expect(chat?.body.model).toBe('vendor/chat-model');
    expect(chat?.auth).toBe(`Bearer ${key}`);
    expect(chat?.body.think).toBeUndefined();
    expect(requests.some(r => r.body.messages?.some((m: any) => m.role === 'tool'))).toBe(true);
    const snapshot = await page.evaluate(() => window.dextana.snapshot());
    expect(snapshot.settings.models).toEqual(['vendor/chat-model']);
    expect(JSON.stringify(snapshot)).not.toContain(key);
    const secretFiles = await readdir(join(directory, 'model-connections'));
    expect(secretFiles).toHaveLength(1);
    expect((await readFile(join(directory, 'model-connections', secretFiles[0]))).includes(Buffer.from(key))).toBe(false);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Fetch models' }).click();
    await expect(page.getByText('1 models available')).toBeVisible();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByRole('button', { name: 'New activity', exact: true }).click();
    await page.getByLabel('Describe your work').fill('Say hello again.');
    await page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(page.getByText('Compatible endpoint connected.', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    // A changed destination must never receive the saved credential.
    await page.getByLabel('Base URL').fill(base + '/other');
    await page.getByRole('button', { name: 'Fetch models' }).click();
    await expect.poll(() => requests.find(r => r.url === '/v1/other/models')).toBeTruthy();
    expect(requests.find(r => r.url === '/v1/other/models')?.auth).toBeUndefined();
    await page.getByLabel('Model ID', { exact: true }).fill('text-embedding-3-small');
    await page.getByRole('button', { name: 'Add model', exact: true }).click();
    await expect(page.getByText('Choose a chat model. Embedding and reranking models are not supported.')).toBeVisible();
  } finally {
    await app.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
