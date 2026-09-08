import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { test, start, reply } from './fixture';

test('multiple Fused integrations keep routing, credentials and approvals isolated across restart', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let executions = 0;
  let integrationId = '';
  const executedPaths: string[] = [];
  let contacts = 0;
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const servers: Server[] = [];
  const gateway = createServer(async (req, res) => {
    contacts++;
    const expectedToken = req.url === '/support' ? 'other-test-token' : 'local-test-token';
    if (req.headers.authorization !== `Bearer ${expectedToken}`) {
      res.writeHead(401);
      return res.end();
    }
    let data = '';
    for await (const chunk of req) data += chunk;
    let transport = transports.get(String(req.headers['mcp-session-id']));
    if (!transport) {
      const mcp = new Server(
        { name: 'Fused fixture', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: 'search_docs',
            description: 'Find operations',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          },
          {
            name: 'execute',
            description: 'Run an operation',
            inputSchema: {
              type: 'object',
              properties: { code: { type: 'string' } },
              required: ['code'],
            },
          },
        ],
      }));
      mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === 'execute') {
          executions++;
          executedPaths.push(req.url!);
        }
        return {
          content: [
            {
              type: 'text',
              text:
                request.params.name === 'execute'
                  ? 'Unified operation completed: report.created'
                  : 'report.create is a Unified operation',
            },
          ],
        };
      });
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: (id) => {
          transports.set(id, transport!);
        },
        enableJsonResponse: true,
      });
      servers.push(mcp);
      await mcp.connect(transport);
    }
    await transport.handleRequest(req, res, data ? JSON.parse(data) : undefined);
  });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(gateway.address() as { port: number }).port}/mcp`;
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'fused',
            arguments: {
              action: 'search_docs',
              integration_id: integrationId,
              arguments_json: '{"query":"create a report"}',
            },
          },
        },
      ]);
    else if (results.length === 1)
      reply(body, res, '', [
        {
          function: {
            name: 'fused',
            arguments: {
              action: 'execute',
              integration_id: integrationId,
              arguments_json: JSON.stringify({
                code: 'return await call("report.create", {input:{},targets:[]});',
              }),
            },
          },
        },
      ]);
    else reply(body, res, 'The unified report operation is complete.');
    return true;
  });
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'MCP connections', exact: true }).click();
    // Preserve coverage for saved connections from the earlier Fused-specific setup.
    integrationId = await work.page.evaluate(async url => {
      const id = await window.dextana.saveFused({ name: 'Fused', enabled: true, url, token: 'local-test-token' });
      await window.dextana.saveFused({ name: 'Support', enabled: true, url: url.replace('/mcp', '/support'), token: 'other-test-token' });
      return id;
    }, url);
    await expect(work.page.getByRole('region', { name: 'Fused integration Support', exact: true })).toBeVisible();
    await start(work.page, 'Create the report with Fused');
    let gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText('MCP · search_docs', {
      timeout: 60_000,
    });
    expect(contacts).toBe(0);
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(gate).toContainText('MCP · execute', { timeout: 30_000 });
    expect(executions).toBe(0);
    await gate.getByRole('button', { name: 'Allow all', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'unified report operation is complete',
      { timeout: 30_000 },
    );
    expect(
      executions,
      JSON.stringify(work.calls.at(-1).messages.filter((m: any) => m.role === 'tool')),
    ).toBe(1);
    expect(JSON.stringify(work.calls)).not.toContain('local-test-token');
    expect(executedPaths).toEqual(['/mcp']);
    integrationId = (
      await work.page.evaluate(() => window.dextana.snapshot())
    ).fusedIntegrations!.find((item) => item.name === 'Support')!.id;
    await work.restart();
    gate = work.page.getByRole('region', { name: 'Action approval' });
    await work.page
      .getByRole('button', { name: 'Create the report with Fused', exact: true })
      .click();
    await work.page.getByLabel('Describe your work').fill('Create another report');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => executions, { timeout: 30_000 }).toBe(2);
    expect(executedPaths).toEqual(['/mcp', '/support']);
    expect(JSON.stringify(work.calls)).not.toContain('other-test-token');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(gate).toHaveCount(0);
    await start(work.page, 'Deny MCP access in another chat');
    await expect(gate).toContainText('MCP · search_docs', { timeout: 30_000 });
    const beforeDenial = contacts;
    await gate.getByRole('button', { name: 'Deny action' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    expect(contacts).toBe(beforeDenial);
  } finally {
    await work.close();
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'MCP connections', exact: true }).click();
    while (
      await work.page.getByRole('button', { name: 'Remove integration', exact: true }).count()
    ) {
      const count = await work.page
        .getByRole('button', { name: 'Remove integration', exact: true })
        .count();
      await work.page
        .getByRole('button', { name: 'Remove integration', exact: true })
        .first()
        .click();
      await expect(
        work.page.getByRole('button', { name: 'Remove integration', exact: true }),
      ).toHaveCount(count - 1);
    }
    for (const server of servers) await server.close();
    gateway.closeAllConnections();
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
  }
});
