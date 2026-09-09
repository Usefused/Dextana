import { expect, test } from 'vitest';
import { modelAuth, modelHeaders } from '../../src/shared/model-auth';

test('authentication supports multiple headers and nested body fields without replacing model input', () => {
  const auth = modelAuth({
    mode: 'custom',
    headers: { 'X-API-Key': 'test-key', 'X-Tenant': 'tenant' },
    body: { credentials: { token: 'body-token' } },
  });
  expect(modelHeaders('unused', auth)).toEqual({ 'x-api-key': 'test-key', 'x-tenant': 'tenant' });
  expect(auth.body).toEqual({ credentials: { token: 'body-token' } });
  for (const body of [
    { messages: [] },
    { tools: [] },
    JSON.parse('{"credentials":{"__proto__":{}}}'),
  ])
    expect(() => modelAuth({ ...auth, body })).toThrow();
  for (const headers of [
    { 'X-Key': 'a\nb' },
    { Host: 'other.example' },
    { 'X-Key': 'a', 'x-key': 'b' },
  ])
    expect(() => modelAuth({ ...auth, headers })).toThrow();
});
