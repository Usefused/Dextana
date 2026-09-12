import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { start } from './fixture';

test('personal memory crosses chats and restarts, uses the shared worker, and disables unsupported embeddings', async ({}, info) => {
  test.setTimeout(120_000);
  const key = 'memory-fixture-key';
  const calls: { path: string; body: any }[] = [];
  let extractionCalls = 0;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    calls.push({ path: req.url!, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== `Bearer ${key}`) { res.writeHead(401); return res.end('{}'); }
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'fixture-chat' }, { id: 'fixture-embedding' }] }));
    if (req.url === '/v1/embeddings') {
      if (body.model === 'unsupported') { res.writeHead(404); return res.end('{}'); }
      expect(body.encoding_format).toBe('float');
      return res.end(JSON.stringify({ data: body.input.map((text: string, index: number) => ({ index, embedding: /weather/.test(text) ? [0, 1] : [1, 0] })) }));
    }
    if (req.url !== '/v1/chat/completions') { res.writeHead(404); return res.end('{}'); }
    const distilling = body.messages.some((m: any) => m.role === 'system' && m.content?.includes('Also extract personal memories'));
    let content: string;
    if (distilling) {
      extractionCalls++;
      expect(body.tools ?? []).toHaveLength(0);
      expect(JSON.stringify(body.messages)).not.toContain(key);
      const source = body.messages.filter((m: any) => m.role === 'user').at(-1).content;
      const memories = source.includes('We sell to small accountancy firms') ? [{ key: 'company.audience', text: 'Our customers are small accountancy firms.' }]
        : source.includes('Our customers are now dentists') ? [{ key: 'company.audience', text: 'Our customers are dentists.' }] : [];
      content = JSON.stringify({ summary: 'The owner discussed their business and requested marketing copy.', memories });
    } else {
      const memory = body.messages.find((m: any) => m.role === 'system' && m.content?.startsWith('Relevant memories from earlier chats.'))?.content ?? '';
      expect(memory).not.toMatch(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i);
      const input = body.messages.filter((m: any) => m.role === 'user').at(-1)?.content ?? '';
      content = input.includes('Long report') ? 'Report detail. '.repeat(5500)
        : input.includes('landing page') ? (memory.includes('dentists') ? 'A landing page for dentists.' : memory.includes('small accountancy firms') ? 'A landing page for small accountancy firms.' : 'No audience memory available.') : 'Understood.';
    }
    const common = { id: 'memory-response', model: body.model, created: 1 };
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    res.end(JSON.stringify({ ...common, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
  const directory = await mkdtemp(join(tmpdir(), 'dextana-memory-'));
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
    await expect(page.getByText('Long-term memory is disabled. Configure an embedding model to enable it.')).toBeVisible();
    await expect(page.getByLabel('Embedding model', { exact: true }).locator('option')).toHaveText(['Disabled', 'fixture-embedding', 'Enter a model ID manually…']);
    await page.getByLabel('Embedding model', { exact: true }).selectOption({ label: 'fixture-embedding' });
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByLabel('Describe your work')).toBeVisible();
    expect((await page.evaluate(() => window.dextana.snapshot())).settings.embeddingDimensions).toBe(2);
    await start(page, 'We sell to small accountancy firms.');
    await expect.poll(async () => (await page.evaluate(() => window.dextana.snapshot())).activities[0]?.events ?? [], { timeout: 30_000 }).toContain('Personal memory updated.');
    expect(extractionCalls).toBe(1);
    await app.close();
    app = await launch(); page = await app.firstWindow();
    await start(page, 'Write a landing page.');
    await expect(page.getByTestId('assistant-message').last()).toHaveText('A landing page for small accountancy firms.', { timeout: 30_000 });
    await expect.poll(() => extractionCalls).toBe(2);
    await start(page, 'Our customers are now dentists.');
    await expect.poll(async () => (await page.evaluate(() => window.dextana.snapshot())).activities[0]?.events ?? [], { timeout: 30_000 }).toContain('Personal memory updated.');
    await start(page, 'Write another landing page.');
    await expect(page.getByTestId('assistant-message').last()).toHaveText('A landing page for dentists.', { timeout: 30_000 });
    await expect.poll(() => extractionCalls).toBe(4);
    // The same completed-turn summaries must satisfy real context compaction,
    // without a second worker pass over those records.
    await start(page, 'Long report one.');
    await expect.poll(() => extractionCalls).toBe(5);
    await expect(page.getByTestId('activity-status')).toHaveText('Completed');
    for (const [prompt, count] of [['Long report two.', 6], ['Long report three.', 7], ['Finish the reports.', 8]] as const) {
      await page.getByLabel('Describe your work').fill(prompt);
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 30_000 });
      await expect.poll(() => extractionCalls).toBe(count);
    }
    const historyEvents = (await page.evaluate(() => window.dextana.snapshot())).activities[0].events;
    expect(historyEvents).toContainEqual(expect.stringMatching(/^Context compacted:/));
    expect(calls.filter(call => call.body.messages?.some((m: any) => m.role === 'system' && m.content?.includes('You compact conversation records') && !m.content?.includes('Also extract personal memories')))).toHaveLength(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Long-term memory is enabled. Relevant details can be remembered across chats.')).toBeVisible();
    await page.screenshot({ path: info.outputPath('memory-enabled.png') });
    await expect(page.getByLabel('Embedding model', { exact: true })).toHaveValue('model:fixture-embedding');
    await page.getByLabel('Embedding model', { exact: true }).selectOption('manual');
    await page.getByLabel('Embedding model ID', { exact: true }).fill('unsupported');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByText(/Long-term memory is disabled. Could not use this embedding model/)).toBeVisible();
    await page.screenshot({ path: info.outputPath('memory-disabled.png') });
    const snapshot = await page.evaluate(() => window.dextana.snapshot());
    expect(snapshot.settings.embeddingDimensions).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain(key);
    const before = calls.length;
    await start(page, 'Write a landing page with memory disabled.');
    await expect(page.getByTestId('assistant-message').last()).toHaveText('No audience memory available.', { timeout: 30_000 });
    expect(calls.slice(before).filter(call => call.path.endsWith('/embeddings'))).toHaveLength(0);
    expect(extractionCalls).toBe(8);
  } finally {
    await app.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
