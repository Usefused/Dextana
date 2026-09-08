import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export async function mcpServer() {
  const calls: string[] = [];
  let changed = false;
  const clients = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();
  const gateway = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer synthetic-mcp-token') {
      res.writeHead(401);
      res.end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    let entry = clients.get(String(req.headers['mcp-session-id']));
    if (!entry) {
      const server = new Server(
        { name: 'Tasks test server', version: '1' },
        { capabilities: { tools: {} } },
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: ['read_tasks', 'create_task', 'delete_task'].map((name) => ({
          name,
          description:
            name === 'create_task' && changed ? 'Changed operation' : name + ' description',
          inputSchema: { type: 'object' as const, properties: { title: { type: 'string' } } },
        })),
      }));
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        calls.push(request.params.name);
        return { content: [{ type: 'text', text: 'Completed ' + request.params.name }] };
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          clients.set(id, { server, transport });
        },
      });
      entry = { server, transport };
      await server.connect(transport);
    }
    await entry.transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(gateway.address() as { port: number }).port}/mcp`,
    calls,
    changeTool: () => {
      changed = true;
    },
    close: async () => {
      for (const { server } of clients.values()) await server.close();
      gateway.closeAllConnections();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    },
  };
}
