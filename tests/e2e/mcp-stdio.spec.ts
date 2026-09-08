import { expect } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, start, reply } from './fixture';

test('a local stdio MCP client can be tested, selected, used, and removed', async ({
  workspace,
}) => {
  test.setTimeout(90000);
  let id = '';
  const work = await workspace((body, res) => {
    if (!body.messages.some((m: any) => m.role === 'tool'))
      reply(body, res, '', [
        {
          function: {
            name: 'mcp',
            arguments: { action: 'call', server_id: id, tool_name: 'ping', arguments_json: '{}' },
          },
        },
      ]);
    else
      reply(
        body,
        res,
        'Local result: ' + body.messages.filter((m: any) => m.role === 'tool').at(-1).content,
      );
    return true;
  });
  const script = join(work.directory, 'local-mcp.mjs');
  const sdk = (path: string) =>
    pathToFileURL(join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/esm', path))
      .href;
  await writeFile(
    script,
    `import {Server} from ${JSON.stringify(sdk('server/index.js'))};
import {StdioServerTransport} from ${JSON.stringify(sdk('server/stdio.js'))};
import {ListToolsRequestSchema,CallToolRequestSchema} from ${JSON.stringify(sdk('types.js'))};
const server=new Server({name:'Local fixture',version:'1'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'ping',description:'Test local MCP',inputSchema:{type:'object',properties:{}}}]}));
server.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:'text',text:process.env.DEXTANA_MCP_TEST==='private-fixture-value'?'stdio works':'missing environment'}]}));
await server.connect(new StdioServerTransport());`,
  );
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'MCP connections', exact: true }).click();
    await work.page.getByLabel('MCP connection name').fill('Local tools');
    await work.page.getByLabel('MCP transport').selectOption('stdio');
    await work.page.getByLabel('MCP command', { exact: true }).fill(process.execPath);
    await work.page.getByLabel('MCP arguments (JSON array)').fill(JSON.stringify([script]));
    await work.page
      .getByLabel('MCP environment (JSON object)')
      .fill('{"DEXTANA_MCP_TEST":"private-fixture-value"}');
    await work.page.getByRole('button', { name: 'Add MCP connection', exact: true }).click();
    const connection = work.page.getByRole('region', {
      name: 'MCP connection Local tools',
      exact: true,
    });
    await connection.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(connection).toContainText('Connected · 1 tools');
    await connection.getByLabel('Policy for ping').selectOption('auto');
    await connection.getByRole('button', { name: 'Save tool permissions' }).click();
    await expect(connection.getByRole('status')).toContainText('Tool permissions saved');
    id = await work.page.evaluate(
      async () =>
        (await window.dextana.snapshot()).mcpConnections!.find((c) => c.name === 'Local tools')!.id,
    );
    expect(await readFile(work.directory + '/state.json', 'utf8')).not.toContain(
      'private-fixture-value',
    );
    await start(work.page, 'Use the local ping tool');
    await expect(work.page.getByTestId('assistant-message')).toContainText('stdio works', {
      timeout: 60000,
    });
    expect(JSON.stringify(work.calls)).not.toContain('private-fixture-value');
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'MCP connections', exact: true }).click();
    await connection.getByRole('button', { name: 'Remove connection' }).click();
    await expect(connection).toHaveCount(0);
  } finally {
    await work.close();
  }
});
