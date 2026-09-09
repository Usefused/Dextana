import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Runtime } from './runtime';
import type { MCPAuth } from '../shared/types';

type ConnectionConfig =
  | { transport: 'http'; url: string; token: string; auth?: MCPAuth }
  | { transport: 'stdio'; command: string; args: string[]; environment: Record<string, string> };

/** Harnest owns both transports; Electron carries settings and local grants. */
export async function backendMCP(runtime: Runtime, config: ConnectionConfig, signal = AbortSignal.timeout(30_000)): Promise<Client> {
  await runtime.ensure();
  const request = async (path: string, data?: unknown, requestSignal = AbortSignal.timeout(70_000), method = 'POST') => {
    const response = await runtime.request('/dextana/mcp' + path, { method, body: data === undefined ? undefined : JSON.stringify(data), signal: requestSignal });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'MCP backend request failed.');
    return body;
  };
  const { id } = await request('/open', config, signal);
  const close = () => request('/close/' + encodeURIComponent(id), undefined, AbortSignal.timeout(5000), 'DELETE');
  const invoke = async (method: string, args: unknown, options?: { signal?: AbortSignal }) => {
    const abort = () => { void close().catch(() => {}); };
    options?.signal?.throwIfAborted();
    options?.signal?.addEventListener('abort', abort, { once: true });
    try { return await request('/request/' + encodeURIComponent(id), { method, args }, options?.signal); }
    finally { options?.signal?.removeEventListener('abort', abort); }
  };
  return {
    listTools: (args: unknown, options: { signal?: AbortSignal }) => invoke('list', args, options),
    callTool: (args: unknown, _schema: unknown, options: { signal?: AbortSignal }) => invoke('call', args, options),
    close,
  } as unknown as Client;
}
