import { test } from './fixture';
import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const release = JSON.parse(readFileSync(new URL('../../packaging/fused-cli-release.json', import.meta.url), 'utf8')) as typeof import('../../packaging/fused-cli-release.json');

test('Fused setup verifies a private CLI install, retries corruption, cancels, and survives restart', async ({ workspace }, info) => {
  test.setTimeout(120_000);
  const asset = release.assets[`${process.platform}-${process.arch}` as keyof typeof release.assets];
  const cache = join(tmpdir(), `dextana-cli-${asset.sha256}.${asset.format}`);
  let archive: Buffer;
  try { archive = await readFile(cache); } catch {
    const response = await fetch(asset.url);
    expect(response.ok).toBe(true);
    archive = Buffer.from(await response.arrayBuffer());
    await writeFile(cache, archive);
  }
  expect(createHash('sha256').update(archive).digest('hex')).toBe(asset.sha256);
  let mode = 'slow';
  let downloads = 0;
  const server = createServer((req, res) => {
    downloads++;
    if (mode === 'corrupt') return res.end('corrupted archive');
    res.writeHead(200, { 'Content-Length': archive.length });
    if (mode === 'slow') { res.write(archive.subarray(0, 1024)); return; }
    res.end(archive);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  const work = await workspace();
  const previousPath = await work.app().evaluate(({}, { url, target }) => {
    const previous = process.env.PATH;
    process.env.PATH = '/nonexistent-dextana-test-bin';
    const original = globalThis.fetch;
    (globalThis as any).__fusedInstallFetch = original;
    globalThis.fetch = (input, options) => original(String(input) === target ? url : input, options);
    return previous;
  }, { url, target: asset.url });
  const setup = () => work.page.getByRole('region', { name: 'Fused CLI setup' });
  async function open() {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connectors' }).click();
    await work.page.getByRole('button', { name: 'Add connector', exact: true }).click();
    await work.page.getByRole('group', { name: 'MCP setup options' }).getByRole('button', { name: 'Fused' }).click();
  }
  try {
    await open();
    await expect(setup().getByRole('button', { name: 'Install for Dextana', exact: true })).toBeVisible();
    expect(downloads).toBe(0);
    await setup().getByRole('button', { name: 'Install for Dextana', exact: true }).click();
    await expect(setup().getByRole('progressbar')).toBeVisible();
    await setup().getByRole('button', { name: 'Cancel download' }).click();
    await expect(setup()).toContainText('Installation cancelled');
    mode = 'corrupt';
    await setup().getByRole('button', { name: 'Install for Dextana', exact: true }).click();
    await expect(setup().getByRole('alert')).toContainText('verification');
    expect((await work.page.evaluate(() => window.dextana.fusedCLIStatus())).active).toBeUndefined();
    mode = 'valid';
    await setup().getByRole('button', { name: 'Retry installation' }).click();
    await expect(setup()).toContainText(`Using Dextana’s installation · ${release.version}`, { timeout: 30_000 });
    await work.page.getByLabel('Fused Engine URL').fill('https://engine.example');
    await expect(work.page.getByRole('button', { name: 'Sign in with Fused' })).toBeEnabled();
    const status = await work.page.evaluate(() => window.dextana.fusedCLIStatus());
    expect(status.managed?.version).toBe(release.version);
    const folder = join(work.directory, 'fused-cli');
    expect((await readdir(folder)).some(name => name.startsWith('.install-'))).toBe(false);
    expect((await readdir(join(folder, status.managed!.directory!))).sort()).toEqual([process.platform === 'win32' ? 'fused-cli.exe' : 'fused-cli']);
    if (process.platform !== 'win32') {
      const bin = join(work.directory, 'existing-cli-test');
      await mkdir(bin);
      await writeFile(join(bin, 'fused-cli'), `#!${process.execPath}\nconsole.log('fused-cli version 0.29.0');`, { mode: 0o700 });
      await work.app().evaluate(({ dialog }, path) => {
        (globalThis as any).__fusedChooseDialog = dialog.showOpenDialog;
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      }, join(bin, 'fused-cli'));
      try { await setup().getByRole('button', { name: 'Locate installed CLI' }).click(); }
      finally { await work.app().evaluate(({ dialog }) => { dialog.showOpenDialog = (globalThis as any).__fusedChooseDialog; }); }

      await expect(setup()).toContainText('Using your existing installation · 0.29.0');
      await setup().getByRole('button', { name: 'Use Dextana’s installation' }).click();
      await expect(setup()).toContainText(`Using Dextana’s installation · ${release.version}`);
    }
    await work.page.screenshot({ path: info.outputPath('fused-cli-installed.png') });
    const theme = (await work.page.evaluate(() => window.dextana.snapshot())).theme;
    try {
      await work.page.evaluate(() => window.dextana.setTheme('dark'));
      await expect(work.page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await work.page.screenshot({ path: info.outputPath('fused-cli-installed-dark.png'), animations: 'disabled' });
    } finally { await work.page.evaluate(value => window.dextana.setTheme(value ?? 'system'), theme); }

    const beforeRestart = downloads;
    await work.restart();
    await open();
    await expect(setup()).toContainText(`Using Dextana’s installation · ${release.version}`);
    expect(downloads).toBe(beforeRestart);
    await work.page.getByLabel('Fused Engine URL').fill('https://engine.example');
    await expect(work.page.getByRole('button', { name: 'Sign in with Fused' })).toBeEnabled();
  } finally {
    const close = work.page.getByRole('button', { name: 'Close add connector' });
    if (await close.isVisible()) await close.click();
    await work.app().evaluate(({}, value) => {
      process.env.PATH = value;
      if ((globalThis as any).__fusedInstallFetch) globalThis.fetch = (globalThis as any).__fusedInstallFetch;
    }, previousPath);
    await rm(join(work.directory, 'fused-cli'), { recursive: true, force: true });
    await work.page.evaluate(() => window.dextana.checkFusedCLI());
    await work.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
