import { expandConnector } from '../connector-helpers';
import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { start, reply } from '../fixture';
import { mcpServer } from '../mcp-fixture';

import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* mcpTools(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
  const server = await mcpServer(true);
  let connectionId = '';
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[lastUser].content;
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'mcp',
            arguments: {
              action: prompt.includes('catalog') ? 'list' : 'call',
              server_id: connectionId,
              tool_name: prompt.includes('delete')
                ? 'delete_task'
                : prompt.includes('read')
                  ? 'read_tasks'
                  : 'create_task',
              arguments_json: '{"title":"Review report"}',
            },
          },
        },
      ]);
    else reply(body, res, 'MCP result: ' + results.at(-1).content);
    return true;
  });
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Connectors', exact: true })
      .click();
    await work.page.getByRole('button', { name: 'Add connector', exact: true }).click();
    await work.page
      .getByRole('group', { name: 'MCP setup options' })
      .getByRole('button', { name: 'Fused' })
      .click();
    await work.page
      .getByRole('button', { name: 'Connect with an existing execution token', exact: true })
      .click();
    await work.page.getByLabel('MCP server URL').fill(server.url);
    await work.page.getByRole('button', { name: 'Continue', exact: true }).click();
    const auth = work.page.getByRole('dialog', { name: 'Connect MCP', exact: true });
    await expect(auth.getByLabel('MCP connection name')).toHaveValue('Fused');
    await auth.getByLabel('MCP connection name').fill('Tasks');
    await auth.getByLabel('Auth token', { exact: true }).fill('wrong-token');
    await auth.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(auth.getByRole('alert')).toContainText('Could not connect');
    await auth.getByLabel('Auth token', { exact: true }).fill('synthetic-mcp-token');
    await auth.getByRole('button', { name: 'Connect', exact: true }).click();
    const connection = () => work.page.getByRole('region', { name: 'MCP connection Tasks', exact: true });
    const tools = () => work.page.getByRole('dialog', { name: 'Choose tools', exact: true });
    await expect(tools()).toBeVisible();
    await expect(tools().getByLabel('Policy for read_tasks')).toHaveValue('disabled');
    await tools().getByRole('checkbox', { name: 'Enable tool read_tasks', exact: true }).click();
    await expect(tools().getByLabel('Policy for read_tasks')).toHaveValue('ask');
    await tools().getByRole('checkbox', { name: 'Enable tool read_tasks', exact: true }).click();
    await expect(tools().getByLabel('Policy for read_tasks')).toHaveValue('disabled');
    await tools().getByRole('button', { name: 'Close dialog' }).click();
    await expandConnector(connection());
    await connection().getByRole('switch', { name: 'Activate Tasks', exact: true }).click();
    await expect(connection().getByRole('status')).toHaveText('Connection deactivated');
    expect(
      await work.page.evaluate(
        async () =>
          (await window.dextana.snapshot()).mcpConnections!.find((c) => c.name === 'Tasks')!
            .enabled,
      ),
    ).toBe(false);
    await expandConnector(connection());
    await connection().getByRole('switch', { name: 'Activate Tasks', exact: true }).click();
    await expect(connection().getByRole('status')).toHaveText('Connection activated');

    await expandConnector(connection());
    await connection().getByRole('button', { name: 'Manage tools', exact: true }).click();
    await tools().getByLabel('Inputs for create_task').click();
    await expect(tools().locator('details[open]')).toContainText('title');
    await tools().getByLabel('Policy for read_tasks').selectOption('auto');
    await tools().getByLabel('Policy for create_task').selectOption('ask');
    await tools().getByRole('button', { name: 'Save tool permissions' }).click();
    await expect(connection().getByRole('status')).toContainText('Tool permissions saved');
    await work.page.screenshot({ path: testInfo.outputPath('mcp-tools.png') });
    connectionId = await work.page.evaluate(
      async () =>
        (await window.dextana.snapshot()).mcpConnections!.find((c) => c.name === 'Tasks')!.id,
    );
    expect(await readFile(work.directory + '/state.json', 'utf8')).not.toContain(
      'synthetic-mcp-token',
    );
    await start(work.page, 'Show the MCP catalog');
    await expect(work.page.getByTestId('assistant-message')).toContainText('read_tasks', {
      timeout: 60_000,
    });
    await expect(work.page.getByTestId('assistant-message')).not.toContainText('delete_task');
    await start(work.page, 'Use read_tasks');
    await expect(work.page.getByTestId('assistant-message')).toContainText('Completed read_tasks');
    await expect(work.page.getByRole('region', { name: 'Action approval' })).toHaveCount(0);
    // Arrange an existing grant from a prior chat approval. Per-tool ask must still win.
    await work.page.evaluate(async () => {
      const activity = (await window.dextana.snapshot()).activities[0];
      await window.dextana.setPermission({
        activityId: activity.id,
        capability: 'mcp',
        autoAllow: true,
      });
    });
    await work.page.getByLabel('Describe your work').fill('Use create_task');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate()).toContainText('create_task');
    await expect(gate()).toContainText('Review report');
    await expect(gate()).not.toContainText('\"arguments\"');
    await expect(gate().locator('pre')).toHaveCount(0);
    await expect(gate().getByLabel('Auto-allow MCP actions in this chat')).toHaveCount(0);
    const approval = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).activities.find((a) => a.approval)?.approval,
    );
    expect(approval?.source).toBe('harnest');
    await work.page.screenshot({ path: testInfo.outputPath('mcp-dynamic-approval.png') });
    expect(server.calls).toEqual(['read_tasks']);
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Completed create_task',
    );
    expect(server.calls).toEqual(['read_tasks', 'create_task']);
    await start(work.page, 'Use create_task but deny it');
    await expect(gate()).toBeVisible();
    await gate().getByRole('button', { name: 'Deny action' }).click();
    await expect(gate()).toHaveCount(0);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    expect(server.calls).toEqual(['read_tasks', 'create_task']);
    await start(work.page, 'Try delete_task');
    await expect(work.page.getByTestId('assistant-message')).toContainText('not enabled');
    expect(server.calls).not.toContain('delete_task');
    await start(work.page, 'Use create_task after a server change');
    await expect(gate()).toBeVisible();
    server.changeTool();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText('MCP tool changed');
    expect(server.calls).toEqual(['read_tasks', 'create_task']);
    yield;
    const page = work.page;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Connectors', exact: true })
      .click();
    await expandConnector(connection());
    await connection().getByRole('button', { name: 'Manage tools', exact: true }).click();
    await expect(tools().getByLabel('Policy for create_task')).toHaveValue('ask');
    await tools().getByRole('button', { name: 'Close dialog' }).click();
    await expandConnector(connection());
    await connection().getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(tools()).toContainText('of 3 enabled');
    await expect(tools().getByLabel('Policy for create_task')).toHaveValue('disabled');
    await expect(tools().getByLabel('Policy for read_tasks')).toHaveValue('auto');
    expect(JSON.stringify(work.calls)).not.toContain('synthetic-mcp-token');
    await tools().getByRole('button', { name: 'Close dialog' }).click();
    await expandConnector(connection());
    await connection().getByRole('button', { name: 'Remove connection' }).click();
    await expect(connection()).toHaveCount(0);
  } finally {
    await work.close();
    await server.close();
  }
}
