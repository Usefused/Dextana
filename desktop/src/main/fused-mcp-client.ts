import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ElicitationCompleteNotificationSchema,
  UrlElicitationRequiredError,
  type ElicitRequestURLParams,
} from '@modelcontextprotocol/sdk/types.js';
import { browserURL } from './browser';

export type FusedAuthentication = {
  id: string;
  url: string;
  message: string;
  action: 'connect' | 'reconnect';
  expiresAt: string;
  retryAllowed: boolean;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Accept only the documented Fused URL-elicitation and replay contract. */
export function fusedAuthentication(
  error: unknown,
  now = Date.now(),
): FusedAuthentication | undefined {
  if (!(error instanceof UrlElicitationRequiredError) || error.elicitations.length !== 1)
    return undefined;
  const item = error.elicitations[0] as ElicitRequestURLParams;
  const meta = record(item._meta)?.['com.usefused/auth'];
  const auth = record(meta);
  if (
    item.mode !== 'url' ||
    typeof item.elicitationId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      item.elicitationId,
    ) ||
    typeof item.message !== 'string' ||
    !item.message.trim() ||
    item.message.length > 500 ||
    auth?.schema_version !== 1 ||
    !['connect', 'reconnect'].includes(String(auth.action)) ||
    auth.recovery_action !== 'complete_authentication'
  )
    return undefined;
  let url: string;
  try {
    url = browserURL(item.url);
    const target = new URL(url);
    if (
      target.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    )
      return undefined;
  } catch {
    return undefined;
  }
  const expiresAt = typeof auth.expires_at === 'string' ? auth.expires_at : '';
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now) return undefined;
  const retryAllowed =
    auth.provider_execution === 'not_started' && auth.execute_request === 'retry_after_auth';
  const doNotReplay =
    auth.provider_execution === 'unknown' && auth.execute_request === 'do_not_replay';
  if (!retryAllowed && !doNotReplay) return undefined;
  return {
    id: item.elicitationId,
    url,
    message: item.message.trim(),
    action: auth.action as 'connect' | 'reconnect',
    expiresAt,
    retryAllowed,
  };
}

export async function openFusedMCP(input: {
  url: string;
  token: string;
  userRef: string;
  signal: AbortSignal;
  onAuthenticationComplete: (elicitationId: string) => void;
}) {
  if (!/^dextana-[0-9a-f-]{36}$/i.test(input.userRef))
    throw new Error('Dext identity is unavailable. Reconnect the Fused workspace.');
  const endpoint = new URL(input.url);
  const client = new Client(
    { name: 'Dextana', version: '0.1.0' },
    { capabilities: { elicitation: { url: {} } } },
  );
  client.setNotificationHandler(ElicitationCompleteNotificationSchema, (notification) => {
    input.onAuthenticationComplete(notification.params.elicitationId);
  });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${input.token}`,
        'X-Fused-End-User-Ref': input.userRef,
      },
    },
    // Never forward the scoped MCP token across an HTTP redirect or another origin.
    fetch: (resource, init) => {
      const target = new URL(resource);
      if (target.origin !== endpoint.origin)
        throw new Error('Fused MCP redirected outside the connected Engine.');
      return fetch(target, { ...init, redirect: 'error' });
    },
  });
  try {
    await client.connect(transport, { signal: input.signal, timeout: 20_000 });
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}
