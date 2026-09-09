import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

test('owner changes appearance before Ollama setup and retains theme and models after restarting', async ({}, info) => {
  const server = createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'embeddinggemma:latest', capabilities: ['embedding'] }, { name: 'qwen3:8b', capabilities: ['completion', 'thinking'] }, { name: 'llama3.2:3b', capabilities: ['completion'] }] }));
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
    const brandBefore = await page.locator('.brand').boundingBox();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect.poll(() => page.locator('.brand').boundingBox()).toEqual(brandBefore);
    const navigation = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(navigation.getByRole('button', { name: /Design language|Design principles/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New activity', exact: true })).toHaveCount(0);
    await expect(navigation.getByRole('button', { name: 'Models', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByLabel('Ollama address').fill('http://localhost:12345');
    await page.getByRole('heading', { name: 'Models', exact: true }).click();
    const expectAlignedFields = async () => {
      const provider = await page.getByLabel('Provider', { exact: true }).boundingBox();
      const endpoint = await page.getByLabel('Ollama address').boundingBox();
      expect(provider).not.toBeNull();
      expect(endpoint).not.toBeNull();
      expect(provider!.x).toBeCloseTo(endpoint!.x, 0);
      expect(provider!.width).toBeCloseTo(endpoint!.width, 0);
      expect(provider!.height).toBe(endpoint!.height);
    };
    await expectAlignedFields();
    await page.screenshot({ path: info.outputPath('settings-models-light.png') });
    const originalSize = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(940, 760));
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(940);
    await expectAlignedFields();
    await page.screenshot({ path: info.outputPath('settings-models-narrow.png') });
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), originalSize);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(originalSize[0]);
    await navigation.getByRole('button', { name: 'Appearance', exact: true }).click();
    const scheme = () => page.locator('html').evaluate(element => getComputedStyle(element).colorScheme);
    const canvas = () => page.locator('html').evaluate(element => getComputedStyle(element).backgroundColor);
    await page.getByLabel('Color theme').selectOption('dark');
    await expect.poll(scheme).toBe('dark');
    await expect.poll(canvas).toBe('rgb(23, 27, 24)');
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await expect(page.evaluate(() => window.dextana.setTheme('invalid' as never))).rejects.toThrow('Choose System, Light, or Dark');
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    // Explicit choices override the OS; System follows changes while the app is open.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByLabel('Color theme').selectOption('light');
    await expect.poll(canvas).toBe('rgb(250, 249, 246)');
    await page.getByLabel('Color theme').selectOption('system');
    await expect.poll(canvas).toBe('rgb(23, 27, 24)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(canvas).toBe('rgb(250, 249, 246)');
    await page.getByLabel('Color theme').selectOption('dark');
    await expect(page.getByRole('status')).toContainText('Appearance saved');
    await navigation.getByRole('button', { name: 'Connectors', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connectors', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByLabel('Ollama address')).toBeHidden();
    await navigation.getByRole('button', { name: 'Models', exact: true }).click();
    await expect(page.getByLabel('Ollama address')).toHaveValue('http://localhost:12345');
    await expectAlignedFields();
    await page.screenshot({ path: info.outputPath('settings-models-dark.png') });
    await page.getByLabel('Ollama address').fill(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button', { name: 'Connect to Ollama' }).click();
    await expect(page.getByText('2 models available')).toBeVisible();
    await expect(page.getByLabel('Default model')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('button', { name: 'Model and reasoning', exact: true })).toContainText('Qwen3:8b');
    await page.getByRole('button', { name: 'Model and reasoning', exact: true }).click();
    await page.getByRole('combobox', { name: 'Activity model', exact: true }).click();
    await expect(page.getByRole('listbox', { name: 'Activity model options' }).getByRole('option')).toHaveText(['Qwen3:8b', 'Llama3.2:3b']);
    await page.getByRole('combobox', { name: 'Activity model', exact: true }).press('Escape');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect.poll(scheme).toBe('dark');
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark');
    await expect(page.getByRole('button', { name: 'Model and reasoning', exact: true })).toContainText('Qwen3:8b');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Ollama address')).toHaveValue(`http://127.0.0.1:${address.port}`);
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Appearance', exact: true }).click();
    await expect(page.getByLabel('Color theme')).toHaveValue('dark');
    await page.getByRole('button', { name: 'Back to chats' }).click();
    await expect(page.getByRole('button', { name: 'New activity', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
  } finally {
    await app.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
