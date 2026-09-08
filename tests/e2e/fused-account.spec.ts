import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from './fixture';

test('connects a personal Fused account and keeps its license encrypted across restart', async ({
  workspace,
}) => {
  const key = 'synthetic-personal-license';
  const server = createServer((req, res) => {
    res.writeHead(req.url === '/auth/whoami' && req.headers['x-api-key'] === key ? 200 : 401, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ subject: 'test-owner' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const work = await workspace();
  const open = async () => {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'MCP connections', exact: true })
      .click();
    await work.page.getByRole('group', { name: 'MCP setup options' }).getByRole('button', { name: 'Fused' }).click();
    await work.page.getByText('Connect your own Fused account (optional)', { exact: true }).click();
  };
  try {
    await open();
    const account = () => work.page.getByRole('region', { name: 'Your Fused account' });
    await account().getByLabel('Fused URL', { exact: true }).fill(`http://127.0.0.1:${port}`);
    await account().getByLabel('Fused license key').fill(key);
    await account().getByRole('button', { name: 'Connect Fused account' }).click();
    await expect(account().getByRole('status')).toContainText('Account connected');
    await expect(account().getByLabel('Fused license key')).toHaveValue('');
    const state = await readFile(join(work.directory, 'state.json'), 'utf8');
    expect(state).not.toContain(key);
    const secretId = JSON.parse(state).fusedAccount.secretId;
    expect(
      (await readFile(join(work.directory, `fused-${secretId}.enc`))).includes(Buffer.from(key)),
    ).toBe(false);
    expect(JSON.stringify(work.calls)).not.toContain(key);
    await work.restart();
    await open();
    await expect(account().getByRole('status')).toContainText('Account connected');
    await account().getByRole('button', { name: 'Disconnect Fused account' }).click();
    await expect(account().getByRole('button', { name: 'Connect Fused account' })).toBeVisible();
    await expect(readFile(join(work.directory, `fused-${secretId}.enc`))).rejects.toThrow();
  } finally {
    await work.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
