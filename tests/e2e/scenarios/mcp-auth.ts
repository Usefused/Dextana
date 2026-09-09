import { expandConnector } from '../connector-helpers';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { start, reply } from '../fixture';
import { mcpServer } from '../mcp-fixture';
import type { RecoveryScenario } from '../recovery';

export const mcpAuthentication: RecoveryScenario = async function* (workspace, info) {
  const modes = ['bearer', 'header', 'body', 'none'] as const;
  const servers = await Promise.all(modes.map(type => mcpServer(true, { type })));
  let id = '';
  const work = await workspace((body, res) => {
    const last = body.messages.findLastIndex((message: any) => message.role === 'user');
    if (!body.messages.slice(last + 1).some((message: any) => message.role === 'tool'))
      reply(body, res, '', [{ function: { name: 'mcp', arguments: { action: 'call', server_id: id, tool_name: 'read_tasks', arguments_json: '{}' } } }]);
    else reply(body, res, 'Connected tasks are ready.');
    return true;
  });
  const ids: string[] = [];
  try {
    for (const [index, mode] of modes.entries()) {
      await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
      await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connectors', exact: true }).click();
      await work.page.getByRole('button', { name: 'Add connector', exact: true }).click();
      await work.page.getByRole('button', { name: 'Custom MCP', exact: true }).click();
      await expect(work.page.getByLabel('MCP connection name')).toHaveCount(0);
      await work.page.getByLabel('MCP server URL').fill(servers[index].url);
      await work.page.getByRole('button', { name: 'Continue', exact: true }).click();
      const auth = work.page.getByRole('dialog', { name: 'Connect MCP', exact: true });
      await expect(auth).toBeVisible();
      if (index === 0) {
        await work.page.keyboard.press('Escape');
        await expect(auth).toHaveCount(0);
        expect((await work.page.evaluate(() => window.dextana.snapshot())).mcpConnections!.filter(c => c.name.startsWith('Auth '))).toHaveLength(0);
        await work.page.getByRole('button', { name: 'Add connector', exact: true }).click();
        await work.page.getByRole('button', { name: 'Custom MCP', exact: true }).click();
        await work.page.getByLabel('MCP server URL').fill(servers[index].url);
        await work.page.getByRole('button', { name: 'Continue', exact: true }).click();
      }
      await auth.getByLabel('MCP connection name').fill(`Auth ${mode}`);
      await auth.getByLabel('Authentication method').selectOption(mode);
      if (mode === 'header') await auth.getByLabel('Header name').fill('X-API-Key');
      if (mode === 'body') await auth.getByLabel('Body field name').fill('api_key');
      if (mode !== 'none') await auth.getByLabel('Auth token', { exact: true }).fill(index === 0 ? 'wrong-token' : 'synthetic-mcp-token');
      if (index === 0) {
        await auth.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect(auth.getByRole('alert')).toBeVisible();
        await expect(work.page.getByRole('dialog', { name: 'Choose tools', exact: true })).toHaveCount(0);
        await auth.getByLabel('Auth token', { exact: true }).fill('synthetic-mcp-token');
      }
      if (mode === 'header') await work.page.screenshot({ path: info.outputPath('mcp-auth-modal.png') });
      await auth.getByRole('button', { name: 'Connect', exact: true }).click();
      const tools = work.page.getByRole('dialog', { name: 'Choose tools', exact: true });
      await expect(tools).toBeVisible();
      await expect(tools.getByLabel('Policy for read_tasks')).toHaveValue('disabled');
      await expect(tools.getByLabel('Policy for delete_task')).toHaveValue('disabled');
      await tools.getByLabel('Search tools').fill('create');
      await expect(tools.getByLabel('Enable tool create_task')).toBeVisible();
      await expect(tools.getByLabel('Enable tool read_tasks')).toHaveCount(0);
      await tools.getByLabel('Search tools').fill('');
      await tools.getByLabel('Enable tool read_tasks').check();
      await expect(tools.getByLabel('Policy for read_tasks')).toHaveValue('ask');
      await tools.getByLabel('Policy for read_tasks').selectOption('auto');
      if (mode === 'header') {
        await work.page.screenshot({ path: info.outputPath('mcp-tools-modal.png') });
        const theme = (await work.page.evaluate(() => window.dextana.snapshot())).theme;
        try {
          await work.page.evaluate(() => window.dextana.setTheme('dark'));
          await expect(work.page.locator('html')).toHaveAttribute('data-theme', 'dark');
          await work.page.screenshot({ path: info.outputPath('mcp-tools-modal-dark.png') });
        } finally { await work.page.evaluate(value => window.dextana.setTheme(value ?? 'system'), theme); }
      }
      await tools.getByRole('button', { name: 'Save tool permissions', exact: true }).click();
      await expect(tools).toHaveCount(0);
      const connection = (await work.page.evaluate(() => window.dextana.snapshot())).mcpConnections!.find(c => c.name === `Auth ${mode}`)!;
      id = connection.id; ids.push(id);
      expect(connection.auth?.type).toBe(mode);
      if (mode === 'header') {
        await expandConnector(work.page.getByRole('region', { name: 'MCP connection Auth header', exact: true }));
        await work.page.getByRole('region', { name: 'MCP connection Auth header', exact: true }).getByRole('button', { name: 'Edit connection', exact: true }).click();
        await expect(auth.getByLabel('Auth token', { exact: true })).toHaveValue('');
        await auth.getByRole('button', { name: 'Connect', exact: true }).click();
        await expect(tools.getByLabel('Policy for read_tasks')).toHaveValue('auto');
        await tools.getByRole('button', { name: 'Save tool permissions', exact: true }).click();
      }
      await start(work.page, `Read tasks with ${mode} authentication`);
      await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
      expect(servers[index].calls).toEqual(['read_tasks']);
      expect(JSON.stringify(work.calls)).not.toContain('synthetic-mcp-token');
    }
    expect(await readFile(work.directory + '/state.json', 'utf8')).not.toContain('synthetic-mcp-token');
    yield;
    for (const [index, mode] of modes.entries()) {
      id = ids[index];
      await start(work.page, `Read tasks after restart with ${mode} authentication`);
      await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
      expect(servers[index].calls).toEqual(['read_tasks', 'read_tasks']);
      await work.page.evaluate(connectionId => window.dextana.removeMCP(connectionId), id);
    }
    expect(JSON.stringify(work.calls)).not.toContain('synthetic-mcp-token');
  } finally {
    await work.close();
    for (const server of servers) await server.close();
  }
};
