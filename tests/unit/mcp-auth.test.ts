import { expect, test } from 'vitest';
import { authFrom } from '../../src/shared/mcp-auth';

test('auth configuration accepts X-API-KEY and rejects HTTP framing and MCP message overrides', () => {
  expect(authFrom({ type: 'header', name: ' X-API-KEY ' })).toEqual({ type: 'header', name: 'X-API-KEY' });
  for (const name of ['Host', 'Content-Length', 'Mcp-Session-Id', 'X-Key\r\nHost: other'])
    expect(() => authFrom({ type: 'header', name })).toThrow('header');
  for (const name of ['params', 'method', 'id', '__proto__', 'credentials.token'])
    expect(() => authFrom({ type: 'body', name })).toThrow('field');
});
