import { FUSED_TOKEN_LIFETIME } from '../shared/fused-token';
import type { FusedCLI, FusedToken } from './fused-cli';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { safeStorage } from 'electron';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { backendMCP } from './backend-mcp';
import type { Runtime } from './runtime';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { MCPConnection, MCPConnectionInput, MCPTool, MCPToolPolicy } from '../shared/types';
import { Store } from './store';
import { endpoint } from './settings';
import { authFrom, customMCPAuth } from '../shared/mcp-auth';

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
  needsToken: boolean;
  sessionAllowed?: boolean;
  expires: number;
};

export class MCPConnections {
  private tokens = new Map<string, { value: FusedToken; scope: string }>();
  private expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  async revokeFused(id?: string) {
    for (const [key, lease] of this.tokens) {
      if (id && !key.startsWith(id + ':')) continue;
      this.tokens.delete(key); clearTimeout(this.expiryTimers.get(key)); this.expiryTimers.delete(key);
      const client = this.clients.get(key); this.clients.delete(key);
      await client?.then(value => value.close()).catch(() => {});
      await this.fusedCLI?.revoke(lease.value).catch(() => {});
    }
  }
  private nativeScope(connection: MCPConnection) { return JSON.stringify([connection.fusedNative, this.store.state.fusedWorkspace?.connectedAt]); }
  private lease(connection: MCPConnection, activityId: string) {
    const lease = this.tokens.get(`${connection.id}:${activityId}`);
    return lease && lease.value.expiresAt > Date.now() + 1000 && lease.scope === this.nativeScope(connection) ? lease.value : undefined;
  }
  private clients = new Map<string, Promise<Client>>();
  private plans = new Map<string, Plan>();
  private busy = new Set<string>();
  constructor(
    private store: Store,
    private directory: string,
    private publish: () => void,
    private fusedCLI?: Pick<FusedCLI, 'issue' | 'revoke'>,
    private runtime?: Runtime,
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
  async selectFused(id: string, autoToken: boolean, operations: string[]) {
    const workspace = this.store.state.fusedWorkspace;
    const server = workspace?.servers.find(item => item.id === id);
    if (!workspace || !server) throw new Error('Refresh Fused and select a discovered MCP version.');
    if (typeof autoToken !== 'boolean' || !Array.isArray(operations) || operations.length > 100 || operations.some(value => typeof value !== 'string' || !value.trim() || value.length > 300 || value.includes('*'))) throw new Error('Choose exact operation IDs, without wildcards.');
    const previous = this.store.state.mcpConnections?.find(item => item.fusedNative?.engine === workspace.url && item.fusedNative.server.id === id);
    const connectionId = previous?.id ?? randomUUID();
    await this.exclusive(connectionId, async () => {
      const connection: MCPConnection = { id: connectionId, name: `${server.name} · ${server.version}`, transport: 'http', url: server.url, command: '', args: [], enabled: true, revision: randomUUID(), tools: previous?.tools ?? [], fusedNative: { engine: workspace.url, server, autoToken, operations: [...new Set(operations.map(value => value.trim()))] } };
      await this.commit(await this.testConnection(connection));
      await this.closeConnection(connectionId);
      await this.revokeFused(connectionId);
    });
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
      throw new Error('Invalid auth token.');
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
      const auth = input.transport === 'http' ? authFrom(input.auth ?? previous?.auth ?? { type: (input.token || previous?.secretId) ? 'bearer' : 'none' }) : undefined;
      if (auth && auth.type !== 'body' && input.token && /[\x00-\x1f\x7f]/.test(input.token)) throw new Error('Header tokens cannot contain line breaks or control characters.');
      const sameEndpoint =
        previous?.transport === input.transport &&
        previous.url === url &&
        previous.command === (input.transport === 'stdio' ? input.command.trim() : '') &&
        JSON.stringify(previous.args) ===
          JSON.stringify(input.transport === 'stdio' ? input.args : []);
      const sameTarget = sameEndpoint && JSON.stringify(auth) === JSON.stringify(previous?.auth ?? (previous?.transport === 'http' ? { type: previous.secretId ? 'bearer' : 'none' } : undefined));
      const customAuth = auth?.type === 'custom' && input.customAuth !== undefined ? customMCPAuth(input.customAuth) : undefined;
      const clearSecret = auth?.type === 'none';
      const replacingSecret = !clearSecret && (input.token !== undefined || input.environment !== undefined || customAuth !== undefined);
      let secretId = clearSecret ? undefined : sameTarget ? previous?.secretId : undefined;
      if (auth?.type === 'custom' && !customAuth && !secretId) throw new Error('Enter custom authentication for this connection.');
      if (auth && !['none', 'custom'].includes(auth.type) && !(input.token || (input.token === undefined && secretId))) throw new Error('Enter an auth token for this connection.');
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
            JSON.stringify({ token: auth?.type === 'custom' ? '' : input.token ?? '', environment: input.environment ?? {}, ...(customAuth ? { customAuth } : {}) }),
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
        auth,
        secretId,
        revision: randomUUID(),
        tools: sameTarget && !replacingSecret ? previous!.tools : [],
        testedAt: sameTarget && !replacingSecret ? previous!.testedAt : undefined,
        fusedNative: sameTarget ? previous?.fusedNative : undefined,
      };
      try {
        await this.commit(value);
      } catch (error) {
        if (replacingSecret && secretId)
          await rm(join(this.directory, `mcp-${secretId}.enc`), { force: true });
        throw error;
      }
      await this.closeConnection(id);
      if (previous?.fusedNative) await this.revokeFused(id);
      if (previous?.secretId && previous.secretId !== secretId)
        await rm(join(this.directory, `mcp-${previous.secretId}.enc`), { force: true });
      return id;
    });
  }
  private async open(connection: MCPConnection, signal: AbortSignal, nativeToken?: string) {
    if (connection.fusedNative && !nativeToken) throw new Error('This Fused MCP requires a scoped connection token.');
    signal.throwIfAborted();
    const secret = nativeToken ? { token: nativeToken, environment: {} } : connection.secretId
      ? JSON.parse(
          safeStorage.decryptString(
            await readFile(join(this.directory, `mcp-${connection.secretId}.enc`)),
          ),
        )
      : { token: '', environment: {} };
    if (!this.runtime) throw new Error('The MCP backend is unavailable.');
    return backendMCP(this.runtime, connection.transport === 'http'
      ? { transport: 'http', url: connection.url, token: secret.token, customAuth: secret.customAuth, auth: nativeToken ? { type: 'bearer' } : connection.auth }
      : { transport: 'stdio', command: connection.command, args: connection.args, environment: secret.environment }, signal);
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
      await this.commit(await this.testConnection(this.find(id)));
      await this.closeConnection(id);
    });
  }
  private async testConnection(connection: MCPConnection): Promise<MCPConnection> {
    const signal = AbortSignal.timeout(30000);
    const native = connection.fusedNative;
    const scope = this.nativeScope(connection);
    const valid = () => {
      signal.throwIfAborted();
      if (native && (scope !== this.nativeScope(connection) || this.store.state.fusedWorkspace?.url !== native.engine)) throw new Error('Fused workspace changed. Test the connection again.');
    };
    let temporaryToken: FusedToken | undefined;
    let client: Client | undefined;
    try {
      if (native) {
        if (this.store.state.fusedWorkspace?.url !== native.engine) throw new Error('Reconnect your Fused workspace in Settings before testing this connection.');
        if (!this.fusedCLI) throw new Error('Fused CLI token service is unavailable. No token was created.');
        // An owner-initiated settings test authorizes discovery, never an agent lease.
        temporaryToken = await this.fusedCLI.issue(native.engine, native.server.mcpId, native.operations, signal);
        valid();
      }
      client = await this.open(connection, signal, temporaryToken?.token);
      const discovered = await this.discover(client, signal);
      valid();
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
      return { ...connection, revision: randomUUID(), testedAt: new Date().toISOString(), tools };
    } finally {
      try { await client?.close(); }
      finally {
        if (temporaryToken) await this.fusedCLI!.revoke(temporaryToken).catch(() => {
          throw new Error('Could not confirm cleanup of the temporary test token. It expires within 24 hours.');
        });
      }
    }
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
      await this.revokeFused(id);
      if (connection.secretId)
        await rm(join(this.directory, `mcp-${connection.secretId}.enc`), { force: true });
    });
  }
  catalog(activityId = '') {
    return (this.store.state.mcpConnections ?? [])
      .filter((connection) => connection.enabled && (!connection.fusedNative || (connection.fusedNative.autoToken && this.store.state.fusedWorkspace?.url === connection.fusedNative.engine)))
      .map((connection) => ({
        id: connection.id,
        name: connection.name,
        tools: connection.tools
          .filter((tool) => tool.policy !== 'disabled' && tool.fingerprint !== 'fused-native-connect-v1')
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
    if (connection.fusedNative && (!connection.fusedNative.autoToken || this.store.state.fusedWorkspace?.url !== connection.fusedNative.engine)) throw new Error('Enable automatic tokens for this MCP in your connected Fused workspace first.');
    const needsToken = !!connection.fusedNative && !this.lease(connection, activityId);
    const tool = connection.tools.find((item) => item.name === toolName && item.fingerprint !== 'fused-native-connect-v1');
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
    const sessionAllows = this.store.state.activities.find(activity => activity.id === activityId)?.allowAllApprovals === true;
    const automatic = !needsToken && (tool.policy === 'auto' || sessionAllows);
    const ticket = randomUUID();
    this.plans.set(ticket, {
      ticket,
      activityId,
      callId,
      connection,
      tool,
      args,
      approved: automatic,
      needsToken,
      sessionAllowed: sessionAllows && !needsToken && tool.policy !== 'auto',
      expires: Date.now() + 300000,
    });
    return {
      ticket,
      requiresApproval: !automatic,
      message: needsToken ? `${connection.name} · Create agent token and ${tool.name}` : `${connection.name} · ${tool.name}`,
      arguments: { ticket, serverId, revision: connection.revision, toolName, args, ...(needsToken && connection.fusedNative ? { token: { mcpId: connection.fusedNative.server.mcpId, version: connection.fusedNative.server.version, endpoint: connection.url, operations: connection.fusedNative.operations.length ? connection.fusedNative.operations : ['*'], expiresIn: FUSED_TOKEN_LIFETIME, scope: 'Token applies to these operations across MCP versions; Dext pins this endpoint.', purpose: `Create a scoped token, then run ${tool.name} with these arguments.` } } : {}) },
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
    if (plan.sessionAllowed && !this.store.state.activities.find(activity => activity.id === activityId)?.allowAllApprovals) throw new Error('Session approval setting changed. Request the action again.');
    if (plan.connection.fusedNative) {
      if (this.store.state.fusedWorkspace?.url !== plan.connection.fusedNative.engine) throw new Error('Fused workspace disconnected. Connect again in Settings.');
      if (plan.needsToken && !this.lease(plan.connection, activityId)) {
        if (!this.fusedCLI) throw new Error('Fused CLI token service is unavailable. No token was created.');
        const native = plan.connection.fusedNative;
        const scope = this.nativeScope(plan.connection);
        const issued = await this.fusedCLI.issue(native.engine, native.server.mcpId, native.operations, signal);
        let client: Client | undefined;
        try {
          valid();
          if (scope !== this.nativeScope(this.find(plan.connection.id))) throw new Error('Fused account changed.');
          client = await this.open(plan.connection, signal, issued.token);
          const tools = (await this.discover(client, signal)).map(tool => ({ ...tool, description: tool.description ?? '', fingerprint: toolFingerprint(tool), policy: plan.connection.tools.find(previous => previous.name === tool.name && previous.fingerprint === toolFingerprint(tool))?.policy ?? 'disabled' as const }));
          valid();
          const previous = this.tokens.get(`${plan.connection.id}:${activityId}`);
          const live = tools.find(tool => tool.name === plan.tool.name);
          if (!live || live.fingerprint !== plan.tool.fingerprint) throw new Error('The tool changed. Review its permissions again.');
          const stale = this.clients.get(`${plan.connection.id}:${activityId}`);
          this.clients.delete(`${plan.connection.id}:${activityId}`);
          await stale?.then(value => value.close()).catch(() => {});
          valid();
          const tokenKey = `${plan.connection.id}:${activityId}`;
          this.tokens.set(tokenKey, { value: issued, scope });
          clearTimeout(this.expiryTimers.get(tokenKey));
          const timer = setTimeout(() => {
            if (this.tokens.get(tokenKey)?.value !== issued) return;
            this.tokens.delete(tokenKey); this.expiryTimers.delete(tokenKey);
            const pending = this.clients.get(tokenKey); this.clients.delete(tokenKey);
            void pending?.then(value => value.close()).catch(() => {});
            void this.fusedCLI?.revoke(issued).catch(() => {});
          }, Math.max(1, issued.expiresAt - Date.now()));
          timer.unref(); this.expiryTimers.set(tokenKey, timer);
          if (previous) void this.fusedCLI.revoke(previous.value).catch(() => {});
        } catch {
          await this.fusedCLI.revoke(issued).catch(() => {});
          throw new Error('Fused connection setup failed. Token revocation was attempted; no service action was executed.');
        } finally { await client?.close().catch(() => {}); }
      }
      if (!this.lease(plan.connection, activityId)) throw new Error('Fused token expired. Request the action again to approve a new token.');
    }
    const key = `${plan.connection.id}:${activityId}`;
    let pending = this.clients.get(key);
    if (!pending) {
      pending = this.open(plan.connection, signal, this.lease(plan.connection, activityId)?.token);
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
    if (plan.connection.fusedNative && !this.lease(plan.connection, activityId)) throw new Error('Fused token expired. Request the action again to approve a new token.');
    try {
      const result = await client.callTool(
        { name: plan.tool.name, arguments: plan.args },
        undefined,
        { signal, timeout: 60000 },
      );
      if (JSON.stringify(result).length > 1_000_000) throw new Error('Result too large.');
      const token = this.lease(plan.connection, activityId)?.token;
      return token ? JSON.parse(JSON.stringify(result).split(token).join('[redacted]')) : result;
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
    await this.revokeFused();
    const clients = [...this.clients.values()];
    this.clients.clear();
    this.plans.clear();
    await Promise.allSettled(clients.map(async (client) => (await client).close()));
  }
}
