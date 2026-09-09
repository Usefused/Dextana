import type { MCPAuth } from './types';
import { modelAuth } from './model-auth';

const reservedHeaders = new Set(['host', 'content-type', 'content-length', 'accept', 'connection', 'transfer-encoding', 'proxy-authorization', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']);
const reservedFields = new Set(['jsonrpc', 'id', 'method', 'params', 'result', 'error', '__proto__', 'constructor', 'prototype']);

export function authFrom(value: MCPAuth): MCPAuth {
  if (!value || typeof value !== 'object') throw new Error('Choose an authentication method.');
  if (value.type === 'none' || value.type === 'bearer' || value.type === 'custom') return { type: value.type };
  if (!['header', 'body'].includes(value.type) || !('name' in value) || typeof value.name !== 'string') throw new Error('Choose an authentication method.');
  const name = value.name.trim();
  if (value.type === 'header') {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) || reservedHeaders.has(name.toLowerCase())) throw new Error('Choose a custom auth header, such as X-API-Key. Protocol headers cannot be replaced.');
    return { type: 'header', name };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(name) || reservedFields.has(name)) throw new Error('Choose a body field such as api_key. MCP message fields cannot be replaced.');
  return { type: 'body', name };
}

export function customMCPAuth(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter custom authentication fields.');
  const auth = modelAuth({ ...value, mode: 'custom' }, reservedFields);
  if (Object.keys(auth.headers).some(name => reservedHeaders.has(name))) throw new Error('MCP protocol headers cannot be replaced.');
  if (!Object.keys(auth.headers).length && !Object.keys(auth.body).length) throw new Error('Add a header or body field, or choose No authentication.');
  return { headers: auth.headers, body: auth.body };
}
