import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Fault, hash } from './core.mjs';
export function serverFor(service, config) {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    try {
      const path = new URL(request.url, config.origin).pathname;
      if (request.method === 'GET' && ['/billing/complete', '/billing/cancelled'].includes(path)) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          `<title>Dext Integrations</title><h1>${path.endsWith('complete') ? 'Return to Dext' : 'Checkout cancelled'}</h1><p>Open Settings → Integrations to verify your email and refresh your subscription status.</p>`,
        );
        return;
      }
      if (request.method === 'GET' && path === '/health') return send(response, { ok: true });
      if (request.method === 'GET' && path === '/v1/catalog')
        return send(response, {
          ...service.catalogPublic(),
          availability: {
            subscribe: Boolean(
              service.billing.sdk &&
              config.mailKey &&
              config.mailFrom &&
              config.apiKey &&
              config.bucketId &&
              config.webhookUrl &&
              service.db.one('SELECT ready FROM stripe_registration WHERE slot=1')?.ready,
            ),
            signIn: Boolean(config.mailKey && config.mailFrom),
          },
        });
      const bytes = await readBody(request);
      // Provider deliveries enter Fused; the local service only consumes the authenticated SDK stream.
      if (path === '/v1/stripe/webhook')
        throw new Fault(404, 'Stripe sends events to the Fused ingress URL.');
      if (request.method !== 'POST' && request.method !== 'GET')
        throw new Fault(405, 'Unsupported method.');
      let input = {};
      if (bytes.length) {
        try {
          input = JSON.parse(bytes.toString());
        } catch {
          throw new Fault(400, 'Invalid JSON.');
        }
      }
      if (!input || Array.isArray(input) || typeof input !== 'object')
        throw new Fault(400, 'Expected an object.');
      // Direct peer address only. Do not trust attacker-supplied forwarding headers.
      service.limit(`ip:${request.socket.remoteAddress}`, 120, 60_000);
      if (path.startsWith('/v1/admin/')) {
        const bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? '')?.[1];
        if (
          !config.adminToken ||
          !bearer ||
          !timingSafeEqual(Buffer.from(hash(bearer)), Buffer.from(hash(config.adminToken)))
        )
          throw new Fault(401, 'An administrator token is required.');
        if (request.method === 'GET' && path === '/v1/admin/status')
          return send(response, {
            billingConfigured: Boolean(service.billing.sdk),
            webhookConfigured: Boolean(config.webhookUrl),
            webhookRegistered: Boolean(
              service.db?.one('SELECT ready FROM stripe_registration WHERE slot=1')?.ready,
            ),
            emailConfigured: Boolean(config.mailKey && config.mailFrom),
            controlConfigured: Boolean(config.apiKey && config.bucketId),
          });
        if (request.method === 'POST' && path === '/v1/admin/stripe/webhook-bootstrap') {
          if (Object.keys(input).length)
            throw new Fault(400, 'Bootstrap uses server configuration; send an empty object.');
          return send(
            response,
            await service.exclusive('admin:stripe-registration', () =>
              service.fused.bootstrapStripeSigningSecret(),
            ),
          );
        }
        if (request.method === 'POST' && path === '/v1/admin/stripe/webhook-registration') {
          if (Object.keys(input).length)
            throw new Fault(400, 'Registration uses server configuration; send an empty object.');
          if (!service.stripeRegistration)
            throw new Fault(503, 'Stripe registration is not configured yet.');
          if (!config.apiKey || !config.bucketId)
            throw new Fault(
              503,
              'Configure the Fused control credential and bucket before registration.',
            );
          return send(
            response,
            await service.exclusive('admin:stripe-registration', () =>
              service.stripeRegistration.register(),
            ),
          );
        }
        throw new Fault(404, 'Endpoint not found.');
      }
      if (request.method === 'POST' && ['/v1/register', '/v1/login', '/v1/verify'].includes(path)) {
        service.limit(`auth:${request.socket.remoteAddress}`, 20);
        const method = path.slice(4);
        return send(response, await service[method](input));
      }
      const bearer = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? '')?.[1];
      const user = service.authenticate(bearer);
      const result = await service.exclusive(user.id, async () => {
        const fresh = service.db.user(user.id);
        if (request.method === 'GET' && path === '/v1/account') return service.account(fresh);
        if (request.method !== 'POST') throw new Fault(404, 'Endpoint not found.');
        switch (path) {
          case '/v1/logout':
            service.db.run('DELETE FROM sessions WHERE user_id=?', user.id);
            await service.revokeAll(fresh);
            return { ok: true };
          case '/v1/checkout':
            return service.checkout(fresh);
          case '/v1/billing':
            return service.billing.portal(fresh);
          case '/v1/providers/connect':
            return service.connect(fresh, input.provider, input.accountId);
          case '/v1/provider-accounts/add':
            return service.addAccount(fresh, input.provider, input.label);
          case '/v1/provider-accounts/select':
            return service.selectAccount(fresh, input.provider, input.accountId);
          case '/v1/providers/enable':
            return service.change(fresh, input.provider, input.enabled);
          case '/v1/credentials':
            return service.credentials(fresh);
          default:
            throw new Fault(404, 'Endpoint not found.');
        }
      });
      send(response, result);
    } catch (error) {
      response.statusCode = error instanceof Fault ? error.status : 500;
      send(response, {
        error: error instanceof Fault ? error.message : 'The request could not be completed.',
        ...(error instanceof Fault && error.connection ? { connection: error.connection } : {}),
      });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return server;
}
function send(response, value) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}
async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 1_000_000) throw new Fault(413, 'Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
