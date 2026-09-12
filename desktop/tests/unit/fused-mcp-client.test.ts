import { describe, expect, test } from 'vitest';
import { UrlElicitationRequiredError } from '@modelcontextprotocol/sdk/types.js';
import { fusedAuthentication } from '../../src/main/fused-mcp-client';

const id = '11111111-1111-4111-8111-111111111111';
const future = '2030-01-01T00:00:00.000Z';

function error(overrides: Record<string, unknown> = {}) {
  return new UrlElicitationRequiredError([
    {
      mode: 'url',
      elicitationId: id,
      url: 'https://engine.example/connect/opaque',
      message: 'Connect your provider account to continue.',
      _meta: {
        'com.usefused/auth': {
          schema_version: 1,
          action: 'connect',
          expires_at: future,
          recovery_action: 'complete_authentication',
          execute_request: 'retry_after_auth',
          provider_execution: 'not_started',
          ...overrides,
        },
      },
    },
  ]);
}

describe('Fused MCP URL elicitation', () => {
  test('accepts the documented safe-to-retry contract', () => {
    expect(fusedAuthentication(error(), Date.parse('2029-01-01'))).toEqual({
      id,
      url: 'https://engine.example/connect/opaque',
      message: 'Connect your provider account to continue.',
      action: 'connect',
      expiresAt: future,
      retryAllowed: true,
    });
  });

  test('accepts unknown execution only as a do-not-replay result', () => {
    expect(
      fusedAuthentication(
        error({ provider_execution: 'unknown', execute_request: 'do_not_replay' }),
        Date.parse('2029-01-01'),
      )?.retryAllowed,
    ).toBe(false);
  });

  test.each([
    { schema_version: 2 },
    { recovery_action: 'retry' },
    { provider_execution: 'unknown', execute_request: 'retry_after_auth' },
    { provider_execution: 'not_started', execute_request: 'do_not_replay' },
    { expires_at: '2020-01-01T00:00:00Z' },
  ])('rejects untrusted metadata %#', (metadata) => {
    expect(fusedAuthentication(error(metadata), Date.parse('2029-01-01'))).toBeUndefined();
  });

  test('rejects non-HTTPS remote authorization URLs', () => {
    const unsafe = error();
    unsafe.elicitations[0].url = 'http://provider.example/connect';
    expect(fusedAuthentication(unsafe, Date.parse('2029-01-01'))).toBeUndefined();
  });
});
