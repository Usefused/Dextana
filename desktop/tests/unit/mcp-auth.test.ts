import { expect, test } from 'vitest';
import { authFrom, customMCPAuth } from '../../src/shared/mcp-auth';

test('auth configuration accepts X-API-KEY and rejects HTTP framing and MCP message overrides', () => {
  expect(authFrom({ type: 'header', name: ' X-API-KEY ' })).toEqual({ type: 'header', name: 'X-API-KEY' });
  for (const name of ['Host', 'Content-Length', 'Mcp-Session-Id', 'X-Key\r\nHost: other'])
    expect(() => authFrom({ type: 'header', name })).toThrow('header');
  for (const name of ['params', 'method', 'id', '__proto__', 'credentials.token'])
    expect(() => authFrom({ type: 'body', name })).toThrow('field');
});

test('custom MCP authentication validates multiple headers and nested body without overriding protocol fields', () => {
  const custom = { headers: { 'X-Key': 'secret', 'X-Tenant': 'tenant' }, body: { credentials: { token: 'secret' } } };
  expect(customMCPAuth(custom).headers).toEqual({ 'x-key': 'secret', 'x-tenant': 'tenant' });
  for (const name of ['params', 'method', 'jsonrpc']) expect(() => customMCPAuth({ ...custom, body: { [name]: 'secret' } })).toThrow();
  for (const name of ['Mcp-Session-Id', 'Accept']) expect(() => customMCPAuth({ ...custom, headers: { [name]: 'secret' } })).toThrow();
  expect(() => customMCPAuth({ headers: {}, body: {} })).toThrow();
});
