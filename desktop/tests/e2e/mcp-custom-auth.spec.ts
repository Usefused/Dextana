import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './fixture';
import { mcpServer } from './mcp-fixture';

test('shared MCP authentication cards connect with multiple secrets and retain them after restart', async ({ workspace }, info) => {
  test.setTimeout(120000);
  const server = await mcpServer(true, { type: 'custom' });
  const work = await workspace();
  const settings = async () => {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connectors', exact: true }).click();
  };
  try {
    await settings();
    await work.page.getByRole('button', { name: 'Add connector', exact: true }).click();
    await work.page.getByLabel('MCP server URL').fill(server.url);
    await work.page.getByRole('button', { name: 'Continue', exact: true }).click();
    const form = work.page.getByRole('dialog', { name: 'Connect MCP', exact: true });
    await form.getByLabel('MCP connection name').fill('Custom secrets');
    await form.getByLabel('Authentication method').selectOption('custom');
    await form.getByLabel('Request headers (JSON)', { exact: true }).fill('{"X-API-Key":"synthetic-mcp-token","X-Tenant":"synthetic-tenant-secret"}');
    await form.getByLabel('Authentication body fields (JSON)', { exact: true }).fill('{"credentials":{"token":"synthetic-body-secret"}}');
    for (const theme of ['light', 'dark'] as const) {
      await work.page.evaluate(theme => window.dextana.setTheme(theme), theme);
      await form.screenshot({ path: info.outputPath(`mcp-custom-auth-${theme}.png`) });
    }
    await work.page.setViewportSize({ width: 480, height: 760 });
    expect(await form.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await form.screenshot({ path: info.outputPath('mcp-custom-auth-narrow.png') });
    const clear = form.getByRole('button', { name: 'Clear custom authentication' });
    await clear.scrollIntoViewIfNeeded();
    await expect(clear).toBeInViewport();
    await form.getByRole('button', { name: 'Connect', exact: true }).scrollIntoViewIfNeeded();
    await expect(form.getByRole('button', { name: 'Connect', exact: true })).toBeInViewport();
    await form.screenshot({ path: info.outputPath('mcp-custom-auth-narrow-footer.png') });
    await work.page.setViewportSize({ width: 1320, height: 880 });
    await form.getByRole('button', { name: 'Connect', exact: true }).click();
    const tools = work.page.getByRole('dialog', { name: 'Choose tools', exact: true });
    await expect(tools.getByLabel('Policy for read_tasks')).toHaveValue('disabled');
    await tools.getByRole('button', { name: 'Close dialog' }).click();
    const snapshot = await work.page.evaluate(() => window.dextana.snapshot());
    const connection = snapshot.mcpConnections!.find(c => c.name === 'Custom secrets')!;
    expect(connection.auth).toEqual({ type: 'custom' });
    for (const secret of ['synthetic-mcp-token', 'synthetic-tenant-secret', 'synthetic-body-secret']) {
      expect(JSON.stringify(snapshot)).not.toContain(secret);
      expect(await readFile(work.directory + '/state.json', 'utf8')).not.toContain(secret);
    }
    await work.restart();
    await settings();
    await work.page.getByRole('button', { name: 'Custom secrets details', exact: true }).click();
    await work.page.getByRole('button', { name: 'Edit connection', exact: true }).click();
    const restored = work.page.getByRole('dialog', { name: 'Connect MCP', exact: true });
    await expect(restored.getByLabel('Request headers (JSON)', { exact: true })).toHaveValue('');
    await restored.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(work.page.getByRole('dialog', { name: 'Choose tools', exact: true })).toBeVisible();
    await expect(work.page.getByLabel('Policy for delete_task')).toHaveValue('disabled');
    await work.page.getByRole('button', { name: 'Close dialog' }).click();
    await expect(work.page.evaluate(({ id, url }) => window.dextana.saveMCP({ id, name: 'Custom secrets', transport: 'http', url, command: '', args: [], enabled: true, auth: { type: 'custom' } }), { id: connection.id, url: server.url + '/different' })).rejects.toThrow('Enter custom authentication');
  } finally { await work.close(); await server.close(); }
});
