import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MCPConnection, MCPConnectionInput, MCPTool, MCPToolPolicy } from '../shared/types';
import { Store } from './store';
import { endpoint } from './settings';

export function toolFingerprint(
  tool: Pick<Tool, 'name' | 'description' | 'inputSchema' | 'outputSchema' | 'annotations'>,
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        tool.name,
        tool.description ?? '',
        tool.inputSchema,
        tool.outputSchema,
        tool.annotations,
      ]),
    )
    .digest('hex');
}
type Plan = {
  ticket: string;
  activityId: string;
  callId: string;
  connection: MCPConnection;
  tool: MCPTool;
  args: Record<string, unknown>;
  approved: boolean;
  expires: number;
};

export class MCPConnections {
  private clients = new Map<string, Promise<Client>>();
  private plans = new Map<string, Plan>();
  private busy = new Set<string>();
  constructor(
    private store: Store,
    private directory: string,
    private publish: () => void,
  ) {}
  private find(id: string) {
    const value = this.store.state.mcpConnections?.find((connection) => connection.id === id);
    if (!value) throw new Error('MCP connection not found.');
    return value;
  }
  private async exclusive<T>(id: string, operation: () => Promise<T>) {
    if (this.busy.has(id))
      throw new Error('This MCP connection is busy. Try again when it finishes.');
    this.busy.add(id);
    try {
      return await operation();
    } finally {
      this.busy.delete(id);
    }
  }
  private async commit(value: MCPConnection) {
    const previous = this.store.state.mcpConnections ?? [];
    this.store.state.mcpConnections = [...previous.filter((item) => item.id !== value.id), value];
    try {
      await this.store.save();
    } catch (error) {
      this.store.state.mcpConnections = previous;
      throw error;
    }
    this.publish();
  }
  async save(input: MCPConnectionInput) {
    if (
      !input ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 100 ||
      !['http', 'stdio'].includes(input.transport) ||
      typeof input.enabled !== 'boolean'
    )
      throw new Error('Enter a name and valid MCP transport.');
    if (
      !Array.isArray(input.args) ||
      input.args.length > 100 ||
      input.args.some((arg) => typeof arg !== 'string' || arg.length > 4000)
    )
      throw new Error('Command arguments must be a JSON array of strings.');
    if (
      input.token !== undefined &&
      (typeof input.token !== 'string' || input.token.length > 16000)
    )
      throw new Error('Invalid bearer token.');
    if (
      input.environment !== undefined &&
      (!input.environment ||
        Array.isArray(input.environment) ||
        typeof input.environment !== 'object' ||
        Object.entries(input.environment).some(
          ([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== 'string',
        ) ||
        JSON.stringify(input.environment).length > 64000)
    )
      throw new Error('Environment must be a JSON object of strings.');
    const url = input.transport === 'http' ? endpoint(input.url) : '';
    if (
      input.transport === 'stdio' &&
      (typeof input.command !== 'string' ||
        !input.command.trim() ||
        input.command.length > 2000 ||
        input.command.includes('\0'))
    )
      throw new Error('Enter the executable for this local MCP server.');
    const id = input.id ?? randomUUID();
    return this.exclusive(id, async () => {
      const previous = input.id ? this.find(input.id) : undefined;
      if (!previous && (this.store.state.mcpConnections?.length ?? 0) >= 20)
        throw new Error('The maximum is 20 MCP connections.');
      const sameTarget =
        previous?.transport === input.transport &&
        previous.url === url &&
        previous.command === (input.transport === 'stdio' ? input.command.trim() : '') &&
        JSON.stringify(previous.args) ===
          JSON.stringify(input.transport === 'stdio' ? input.args : []);
      const replacingSecret = input.token !== undefined || input.environment !== undefined;
      let secretId = sameTarget ? previous?.secretId : undefined;
      if (replacingSecret) {
        if (
          !safeStorage.isEncryptionAvailable() ||
          (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
        )
          throw new Error('A system keyring is required to save MCP credentials.');
        secretId = randomUUID();
        await writeFile(
          join(this.directory, `mcp-${secretId}.enc`),
          safeStorage.encryptString(
            JSON.stringify({ token: input.token ?? '', environment: input.environment ?? {} }),
          ),
          { mode: 0o600 },
        );
      }
      const value: MCPConnection = {
        id,
        name: input.name.trim(),
        transport: input.transport,
        url,
        command: input.transport === 'stdio' ? input.command.trim() : '',
        args: input.transport === 'stdio' ? [...input.args] : [],
        enabled: input.enabled,
        secretId,
        revision: randomUUID(),
        tools: sameTarget && !replacingSecret ? previous!.tools : [],
        testedAt: sameTarget && !replacingSecret ? previous!.testedAt : undefined,
      };
      try {
        await this.commit(value);
      } catch (error) {
        if (replacingSecret && secretId)
          await rm(join(this.directory, `mcp-${secretId}.enc`), { force: true });
        throw error;
      }
      await this.closeConnection(id);
      if (previous?.secretId && previous.secretId !== secretId)
        await rm(join(this.directory, `mcp-${previous.secretId}.enc`), { force: true });
      return id;
    });
  }
  private async open(connection: MCPConnection, signal: AbortSignal) {
    signal.throwIfAborted();
    const secret = connection.secretId
      ? JSON.parse(
          safeStorage.decryptString(
            await readFile(join(this.directory, `mcp-${connection.secretId}.enc`)),
          ),
        )
      : { token: '', environment: {} };
    const client = new Client({ name: 'Dextana', version: '0.1.0' });
    const transport =
      connection.transport === 'http'
        ? new StreamableHTTPClientTransport(new URL(connection.url), {
            requestInit: {
              headers: secret.token ? { Authorization: `Bearer ${secret.token}` } : {},
            },
            fetch: (url, init) =>
              fetch(url, {
                ...init,
                redirect: 'error',
                signal: AbortSignal.any([
                  ...(init?.signal ? [init.signal] : []),
                  AbortSignal.timeout(20000),
                ]),
              }),
            reconnectionOptions: {
              maxRetries: 0,
              initialReconnectionDelay: 1000,
              maxReconnectionDelay: 1000,
              reconnectionDelayGrowFactor: 1,
            },
          })
        : new StdioClientTransport({
            command: connection.command,
            args: connection.args,
            env: { ...getDefaultEnvironment(), ...secret.environment },
            stderr: 'pipe',
            maxBufferSize: 2_000_000,
          });
    if (transport instanceof StdioClientTransport) transport.stderr?.on('data', () => {});
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(20000)]);
    let abort = () => {};
    try {
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => {
          abort = () => reject(new Error('Connection cancelled or timed out.'));
          deadline.addEventListener('abort', abort, { once: true });
          if (deadline.aborted) abort();
        }),
      ]);
      return client;
    } catch {
      await client.close().catch(() => {});
      throw new Error('Could not connect to MCP. Check the address or command and credentials.');
    } finally {
      deadline.removeEventListener('abort', abort);
    }
  }
  private async discover(client: Client, signal: AbortSignal) {
    const tools: Tool[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = await client.listTools(cursor ? { cursor } : {}, { signal, timeout: 20000 });
      tools.push(...result.tools);
      if (tools.length > 500 || JSON.stringify(tools).length > 1_000_000)
        throw new Error('MCP tool catalog is too large.');
      cursor = result.nextCursor;
      if (cursor) {
        if (seen.has(cursor) || seen.size >= 10) throw new Error('Invalid MCP tool pagination.');
        seen.add(cursor);
      }
    } while (cursor);
    if (new Set(tools.map((tool) => tool.name)).size !== tools.length)
      throw new Error('MCP returned duplicate tool names.');
    return tools;
  }
  async test(id: string) {
    return this.exclusive(id, async () => {
      const connection = this.find(id);
      const signal = AbortSignal.timeout(30000);
      const client = await this.open(connection, signal);
      try {
        const discovered = await this.discover(client, signal);
        const tools = discovered.map((tool) => {
          const fingerprint = toolFingerprint(tool);
          const previous = connection.tools.find(
            (item) => item.name === tool.name && item.fingerprint === fingerprint,
          );
          return {
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            fingerprint,
            policy: previous?.policy ?? 'disabled',
          } as MCPTool;
        });
        await this.commit({
          ...connection,
          revision: randomUUID(),
          testedAt: new Date().toISOString(),
          tools,
        });
        await this.closeConnection(id);
      } finally {
        await client.close();
      }
    });
  }
  async setTools(id: string, policies: Record<string, MCPToolPolicy>) {
    return this.exclusive(id, async () => {
      const connection = this.find(id);
      if (
        !policies ||
        typeof policies !== 'object' ||
        Array.isArray(policies) ||
        Object.keys(policies).length !== connection.tools.length ||
        connection.tools.some(
          (tool) =>
            !Object.hasOwn(policies, tool.name) ||
            !['disabled', 'ask', 'auto'].includes(policies[tool.name]),
        )
      )
        throw new Error('Choose a policy for each discovered tool.');
      await this.commit({
        ...connection,
        revision: randomUUID(),
        tools: connection.tools.map((tool) => ({ ...tool, policy: policies[tool.name] })),
      });
      await this.closeConnection(id);
    });
  }
  async remove(id: string) {
    return this.exclusive(id, async () => {
      const connection = this.find(id);
      const previous = this.store.state.mcpConnections;
      this.store.state.mcpConnections = previous!.filter((item) => item.id !== id);
      try {
        await this.store.save();
      } catch (error) {
        this.store.state.mcpConnections = previous;
        throw error;
      }
      this.publish();
      await this.closeConnection(id);
      if (connection.secretId)
        await rm(join(this.directory, `mcp-${connection.secretId}.enc`), { force: true });
    });
  }
  catalog() {
    return (this.store.state.mcpConnections ?? [])
      .filter((connection) => connection.enabled)
      .map((connection) => ({
        id: connection.id,
        name: connection.name,
        tools: connection.tools
          .filter((tool) => tool.policy !== 'disabled')
          .map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      }))
      .filter((connection) => connection.tools.length);
  }
  prepare(
    activityId: string,
    callId: string,
    serverId: string,
    toolName: string,
    argumentsJson: string,
  ) {
    const connection = this.find(serverId);
    const tool = connection.tools.find((item) => item.name === toolName);
    if (!connection.enabled || !tool || tool.policy === 'disabled' || this.busy.has(serverId))
      throw new Error('This MCP tool is not enabled. Review its permissions in Settings.');
    if (typeof argumentsJson !== 'string' || argumentsJson.length > 128000)
      throw new Error('Invalid MCP arguments.');
    const args = JSON.parse(argumentsJson);
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('MCP arguments must be a JSON object.');
    if (
      [...this.plans.values()].some(
        (plan) => plan.activityId === activityId && plan.callId === callId,
      )
    )
      throw new Error('An MCP action is already pending for this call.');
    const ticket = randomUUID();
    this.plans.set(ticket, {
      ticket,
      activityId,
      callId,
      connection,
      tool,
      args,
      approved: tool.policy === 'auto',
      expires: Date.now() + 300000,
    });
    return {
      ticket,
      requiresApproval: tool.policy === 'ask',
      message: `${connection.name} · ${tool.name}`,
      arguments: { ticket, serverId, revision: connection.revision, toolName, args },
    };
  }
  pending(activityId: string, callId: string) {
    const plan = [...this.plans.values()].find(
      (plan) => plan.activityId === activityId && plan.callId === callId,
    );
    if (!plan || plan.expires < Date.now()) throw new Error('No matching MCP action is pending.');
    return plan;
  }
  grant(activityId: string, callId: string) {
    this.pending(activityId, callId).approved = true;
  }
  async execute(activityId: string, callId: string, ticket: string, signal: AbortSignal) {
    const plan = this.pending(activityId, callId);
    if (ticket !== plan.ticket || !plan.approved)
      throw new Error('MCP execution requires an exact approved action.');
    this.plans.delete(ticket); // Consume before any network I/O; never replay uncertain calls.
    const valid = () => {
      signal.throwIfAborted();
      if (
        this.busy.has(plan.connection.id) ||
        this.find(plan.connection.id).revision !== plan.connection.revision
      )
        throw new Error('MCP connection or tool permissions changed. Request the action again.');
    };
    valid();
    const key = `${plan.connection.id}:${activityId}`;
    let pending = this.clients.get(key);
    if (!pending) {
      pending = this.open(plan.connection, signal);
      this.clients.set(key, pending);
      pending.catch(() => {
        if (this.clients.get(key) === pending) this.clients.delete(key);
      });
    }
    const client = await pending;
    const live = (await this.discover(client, signal)).find((tool) => tool.name === plan.tool.name);
    if (!live || toolFingerprint(live) !== plan.tool.fingerprint)
      throw new Error('MCP tool changed. Test the connection and review its permissions again.');
    valid();
    try {
      const result = await client.callTool(
        { name: plan.tool.name, arguments: plan.args },
        undefined,
        { signal, timeout: 60000 },
      );
      if (JSON.stringify(result).length > 1_000_000) throw new Error('Result too large.');
      return result;
    } catch {
      throw new Error(
        'MCP execution did not return a usable result. Its outcome may be unknown; do not automatically retry.',
      );
    }
  }
  release(activityId: string) {
    for (const [key, plan] of this.plans)
      if (plan.activityId === activityId) this.plans.delete(key);
  }
  private async closeConnection(id: string) {
    const clients = [...this.clients].filter(([key]) => key.startsWith(id + ':'));
    for (const [key] of clients) this.clients.delete(key);
    await Promise.allSettled(clients.map(async ([, client]) => (await client).close()));
  }
  async close() {
    const clients = [...this.clients.values()];
    this.clients.clear();
    this.plans.clear();
    await Promise.allSettled(clients.map(async (client) => (await client).close()));
  }
}
