import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

test('owner connects Ollama, selects a model and retains settings after restarting', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:3b' }] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const dir = await mkdtemp(join(tmpdir(), 'dextana-e2e-'));
  const launch = () =>
    electron.launch({ args: ['.'], env: { ...process.env, DEXTANA_USER_DATA: dir } });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const navigation = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(page.getByRole('button', { name: 'New activity', exact: true })).toHaveCount(0);
    await expect(navigation.getByRole('button', { name: 'Models', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByLabel('Ollama address').fill('http://localhost:12345');
    await navigation.getByRole('button', { name: 'MCP connections', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'MCP connections', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByLabel('Ollama address')).toBeHidden();
    await navigation.getByRole('button', { name: 'Models', exact: true }).click();
    await expect(page.getByLabel('Ollama address')).toHaveValue('http://localhost:12345');
    await page.getByLabel('Ollama address').fill(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: 'Connect to Ollama' }).click();
    await expect(page.getByText('2 models available')).toBeVisible();
    await page.getByLabel('Default model').selectOption('qwen3:8b');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByLabel('Activity model')).toHaveValue('qwen3:8b');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByLabel('Activity model')).toHaveValue('qwen3:8b');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Ollama address')).toHaveValue(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: 'Back to chats' }).click();
    await expect(page.getByRole('button', { name: 'New activity', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
