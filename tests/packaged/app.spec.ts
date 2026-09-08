import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the packaged Dextana app runs its compiled agent without Harnest or Python on PATH', async () => {
  test.setTimeout(180_000);
  const executablePath = process.env.DEXTANA_PACKAGED_EXECUTABLE;
  if (!executablePath)
    throw new Error('DEXTANA_PACKAGED_EXECUTABLE must point to the packaged app.');
  const site = createServer(async (req, res) => {
    if (req.url === '/login') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<title>Sign in</title><input type="password">');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }));
    if (req.url === '/api/show')
      return res.end(
        JSON.stringify({ capabilities: ['completion', 'tools'], model_info: {}, template: '' }),
      );
    let input = '';
    for await (const chunk of req) input += chunk;
    const body = JSON.parse(input || '{}');
    const message = body.messages?.some((entry: any) => entry.role === 'tool')
      ? { role: 'assistant', content: 'The packaged backend is working.' }
      : {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'packaged-browser',
              type: 'function',
              function: {
                name: 'browser',
                arguments: {
                  action: 'open',
                  url: `http://127.0.0.1:${(site.address() as { port: number }).port}/login`,
                },
              },
            },
          ],
        };
    if (body.stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.write(JSON.stringify({ model: body.model, message, done: false }) + '\n');
      res.end(
        JSON.stringify({
          model: body.model,
          message: { role: 'assistant', content: '' },
          done: true,
        }) + '\n',
      );
    } else res.end(JSON.stringify({ model: body.model, message, done: true }));
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'dextana-packaged-'));
  // Finder/Explorer launch should work without a developer shell or installed CLI.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.platform === 'win32' ? process.env.SystemRoot + '\\System32' : '/usr/bin:/bin',
    DEXTANA_USER_DATA: directory,
  };
  delete env.PYTHONPATH;
  delete env.PYTHONHOME;
  const app = await electron.launch({
    executablePath,
    args: [],
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  });
  try {
    const page = await app.firstWindow();
    const identity = await app.evaluate(({ app, Menu, BrowserWindow }) => ({
      name: app.getName(),
      packaged: app.isPackaged,
      title: BrowserWindow.getAllWindows()[0].getTitle(),
      settings: !!Menu.getApplicationMenu()?.getMenuItemById('open-settings'),
    }));
    expect(identity).toEqual({ name: 'Dextana', packaged: true, title: 'Dextana', settings: true });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByLabel('Ollama address')
      .fill(`http://127.0.0.1:${(site.address() as { port: number }).port}`);
    await page.getByRole('button', { name: 'Connect to Ollama' }).click();
    await page.getByLabel('Default model').selectOption('qwen3:8b');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await page.getByLabel('Describe your work').fill('Check the packaged backend');
    await page.getByRole('button', { name: 'Start activity' }).click();
    const approval = page.getByRole('region', { name: 'Action approval' });
    await expect(approval).toBeVisible({ timeout: 120_000 });
    await approval.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(page.getByTestId('assistant-message')).toContainText(
      'The packaged backend is working.',
      { timeout: 120_000 },
    );
    await expect(page.getByTestId('activity-status')).toHaveText('Completed');
    await app.evaluate(({ shell, clipboard }) => {
      clipboard.writeText = (text) => {
        (globalThis as any).copiedCode = text;
      };
      shell.openPath = async (path) => {
        (globalThis as any).openedExtension = path;
        return '';
      };
    });
    await page.getByRole('button', { name: 'Use login from my browser' }).click();
    const code = await page.getByLabel('Browser connection code').inputValue();
    await page.getByRole('button', { name: 'Copy connection code', exact: true }).click();
    expect(await app.evaluate(() => (globalThis as any).copiedCode)).toBe(code);
    await page.locator('summary').filter({ hasText: 'Need the extension?' }).click();
    await page.getByRole('button', { name: 'Open extension folder' }).click();
    const extensionFolder = join(directory, 'Browser Extensions', 'Dextana Login');
    await expect
      .poll(() => app.evaluate(() => (globalThis as any).openedExtension))
      .toBe(extensionFolder);
    const manifest = JSON.parse(await readFile(join(extensionFolder, 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe('Dextana Login Transfer');
    expect(manifest.version).toBe('0.2.0');
    expect(await readFile(join(extensionFolder, 'transfer.js'), 'utf8')).toContain(
      'DextanaTransfer',
    );
    await page.getByRole('button', { name: 'Cancel transfer', exact: true }).click();
  } finally {
    await app.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
