import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export async function mcpServer(paginated = false, auth: { type: 'bearer' | 'header' | 'body' | 'none'; name?: string } = { type: 'bearer' }) {
  const calls: string[] = [];
  let changed = false;
  const clients = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();
  const gateway = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = body ? JSON.parse(body) : undefined;
    const authenticated = auth.type === 'none' || (auth.type === 'bearer' ? req.headers.authorization === 'Bearer synthetic-mcp-token'
      : auth.type === 'header' ? req.headers[(auth.name ?? 'X-API-Key').toLowerCase()] === 'synthetic-mcp-token'
      : req.method === 'POST' ? payload?.[auth.name ?? 'api_key'] === 'synthetic-mcp-token' : clients.has(String(req.headers['mcp-session-id'])));
    if (!authenticated) {
      res.writeHead(401);
      res.end();
      return;
    }
    if (auth.type === 'body' && payload) delete payload[auth.name ?? 'api_key'];
    let entry = clients.get(String(req.headers['mcp-session-id']));
    if (!entry) {
      const server = new Server(
        { name: 'Tasks test server', version: '1' },
        { capabilities: { tools: {} } },
      );
      server.setRequestHandler(ListToolsRequestSchema, async (request) => ({
        ...(paginated && !request.params?.cursor ? { nextCursor: 'remaining-tools' } : {}),
        tools: (paginated ? (request.params?.cursor ? ['create_task', 'delete_task'] : ['read_tasks']) : ['read_tasks', 'create_task', 'delete_task']).map((name) => ({
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
    await entry.transport.handleRequest(req, res, payload);
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
