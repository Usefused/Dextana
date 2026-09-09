import { expandConnector } from './connector-helpers';
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
  const processes = join(work.directory, 'mcp-processes.jsonl');
  const launched = async (): Promise<{ pid: number; parent: number }[]> =>
    (await readFile(processes, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const sdk = (path: string) =>
    pathToFileURL(join(process.cwd(), 'node_modules/@modelcontextprotocol/sdk/dist/esm', path))
      .href;
  await writeFile(
    script,
    `import {appendFileSync} from 'node:fs';
import {Server} from ${JSON.stringify(sdk('server/index.js'))};
import {StdioServerTransport} from ${JSON.stringify(sdk('server/stdio.js'))};
import {ListToolsRequestSchema,CallToolRequestSchema} from ${JSON.stringify(sdk('types.js'))};
const server=new Server({name:'Local fixture',version:'1'},{capabilities:{tools:{}}});
appendFileSync(${JSON.stringify(processes)}, JSON.stringify({pid:process.pid,parent:process.ppid})+'\\n');
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'ping',description:'Test local MCP',inputSchema:{type:'object',properties:{}}}]}));
server.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:'text',text:process.env.DEXTANA_RUNTIME_TOKEN?'runtime credential leaked':process.env.DEXTANA_MCP_TEST==='private-fixture-value'?'stdio works':'missing environment'}]}));
await server.connect(new StdioServerTransport());`,
  );
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connectors', exact: true }).click();
    await work.page.getByRole('button', { name: 'Add connector', exact: true }).click();
    await work.page.getByRole('button', { name: 'Connect a local tool', exact: true }).click();
    await work.page.getByLabel('MCP connection name').fill('Local tools');
    await work.page.getByLabel('MCP command', { exact: true }).fill(process.execPath);
    await work.page.getByLabel('MCP arguments (JSON array)').fill(JSON.stringify([script]));
    await work.page
      .getByLabel('MCP environment (JSON object)')
      .fill('{"DEXTANA_MCP_TEST":"private-fixture-value"}');
    await work.page.getByRole('button', { name: 'Connect', exact: true }).click();
    const connection = work.page.getByRole('region', {
      name: 'MCP connection Local tools',
      exact: true,
    });
    const tools = work.page.getByRole('dialog', { name: 'Choose tools', exact: true });
    await expect(tools).toBeVisible();
    // Local servers belong to the backend, and a settings test releases its process.
    expect((await launched())[0].parent).not.toBe(work.app().process().pid);
    await expect.poll(async () => (await launched()).some(({ pid }) => alive(pid))).toBe(false);
    await tools.getByLabel('Policy for ping').selectOption('auto');
    await tools.getByRole('button', { name: 'Save tool permissions' }).click();
    await expandConnector(connection);
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
    const firstChatProcess = (await launched()).at(-1)!.pid;
    await start(work.page, 'Use the local ping tool in another chat');
    await expect(work.page.getByTestId('assistant-message')).toContainText('stdio works');
    expect((await launched()).at(-1)!.pid).not.toBe(firstChatProcess);
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connectors', exact: true }).click();
    await expandConnector(connection);
    await connection.getByRole('button', { name: 'Remove connection' }).click();
    await expect(connection).toHaveCount(0);
    await expect.poll(async () => (await launched()).some(({ pid }) => alive(pid))).toBe(false);
  } finally {
    await work.close();
  }
});
