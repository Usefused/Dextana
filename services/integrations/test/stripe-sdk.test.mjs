import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Database } from '../src/database.mjs';
import { Billing } from '../src/billing.mjs';
import {
  StripeRegistration,
  STRIPE_EVENTS,
  STRIPE_VERSION,
  listenForStripe,
} from '../src/stripe-webhooks.mjs';
import { serverFor } from '../src/http.mjs';
import { Fused } from '../src/fused.mjs';

function setup(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const config = {
    origin: 'http://127.0.0.1',
    engine: 'https://fused.run.usefused.com',
    apiKey: 'test-control',
    bucketId: 'test-bucket',
    webhookUrl: 'https://fused.run.usefused.com/webhook/dext-test-stripe',
    stripeLive: false,
  };
  const calls = [],
    stored = [];
  const sdk = {
    Stripe: {
      async postWebhookEndpoints(options) {
        calls.push(options);
        return {
          ok: true,
          data: {
            id: 'we_test',
            secret: 'whsec_private',
            url: options.url,
            status: 'enabled',
            api_version: options.api_version,
            enabled_events: options.enabled_events,
            livemode: false,
          },
        };
      },
    },
  };
  const billing = new Billing(config, sdk);
  const registration = new StripeRegistration(db, billing, config, randomBytes(32), async (value) =>
    stored.push(value),
  );
  return { db, config, sdk, calls, stored, billing, registration };
}

test('billing calls the generated Stripe methods with typed fields and a stable idempotency header', async () => {
  const calls = [];
  const billing = new Billing(
    { origin: 'https://integrations.example' },
    {
      Stripe: {
        async postCheckoutSessions(options) {
          calls.push(options);
          return { ok: true, data: { id: 'cs_test' } };
        },
      },
    },
  );
  const user = {
    id: 'alice',
    email: 'alice@example.com',
    checkout_nonce: 'retry',
    checkout_expires: 5000000,
  };
  await billing.checkout(user);
  await billing.checkout(user);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].headers['Idempotency-Key'], 'checkout-alice-retry');
  assert.equal(calls[0].headers['Stripe-Version'], STRIPE_VERSION);
  assert.equal(calls[0].line_items[0].price_data.unit_amount, 1000);
  assert.equal(calls[0].line_items[0].price_data.currency, 'gbp');
  assert.equal(calls[0].subscription_data.metadata.dext_user_id, 'alice');
  assert.equal(calls[0].expires_at, 5000);
});

test('SDK failures never expose the upstream response or secrets', async () => {
  const billing = new Billing(
    {},
    {
      Stripe: {
        async postWebhookEndpoints() {
          return { ok: false, error: { secret: 'whsec_private' } };
        },
      },
    },
  );
  await assert.rejects(billing.request('postWebhookEndpoints', {}), (error) => {
    assert.equal(error.status, 502);
    assert.equal(error.message.includes('whsec'), false);
    return true;
  });
  await assert.rejects(new Billing({}).checkout({}), { status: 503 });
});

test('registration persists an encrypted secret, retries bucket storage, and never creates a duplicate endpoint', async (t) => {
  const f = setup(t);
  f.registration.storeSecret = async () => {
    throw new Error('offline');
  };
  await assert.rejects(f.registration.register(), /offline/);
  const row = f.db.one('SELECT * FROM stripe_registration');
  assert.equal(row.ready, 0);
  assert.equal(row.endpoint_id, 'we_test');
  assert.equal(row.ciphertext.includes('whsec_private'), false);
  const restarted = new StripeRegistration(
    f.db,
    f.billing,
    f.config,
    f.registration.encryptionKey,
    async (value) => f.stored.push(value),
  );
  const result = await restarted.register();
  await restarted.register();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.stored, ['whsec_private']);
  assert.equal(f.db.one('SELECT * FROM stripe_registration').ciphertext, null);
  assert.equal(JSON.stringify(result).includes('whsec'), false);
  assert.deepEqual(f.calls[0].enabled_events, STRIPE_EVENTS);
  assert.equal(f.calls[0].api_version, STRIPE_VERSION);
});

test('unknown Stripe create results reuse the durable nonce; old uncertain attempts require reconciliation', async (t) => {
  const f = setup(t);
  const original = f.sdk.Stripe.postWebhookEndpoints;
  let attempts = 0;
  f.sdk.Stripe.postWebhookEndpoints = async (options) => {
    attempts++;
    if (attempts === 1) {
      f.calls.push(options);
      throw new Error('lost response');
    }
    return original(options);
  };
  await assert.rejects(f.registration.register(), { status: 502 });
  await f.registration.register();
  assert.deepEqual(f.calls[0], f.calls[1]);
  f.db.run('UPDATE stripe_registration SET endpoint_id=NULL,created=?', Date.now() - 24 * 3600000);
  await assert.rejects(f.registration.register(), { status: 409 });
  assert.equal(attempts, 2);
});

test('registration cannot redirect the endpoint or accept the wrong Stripe mode', async (t) => {
  const f = setup(t);
  f.config.webhookUrl = 'https://attacker.example/webhook/test';
  await assert.rejects(f.registration.register(), { status: 503 });
  assert.equal(f.calls.length, 0);
  f.config.webhookUrl = 'https://fused.run.usefused.com/webhook/dext-test-stripe';
  f.config.stripeLive = true;
  await assert.rejects(f.registration.register(), { status: 502 });
  assert.equal(f.stored.length, 0);
});

test('SDK receiver acknowledges only after durable handling and rejects wrong mode or storage failure', async () => {
  let handler,
    persisted = false,
    failure = false,
    ack = 0,
    nack = 0;
  const module = {
    StripeWebhook: Object.fromEntries(
      STRIPE_EVENTS.map((e) => [e.toUpperCase().replaceAll('.', '_'), `stripe.${e}`]),
    ),
    FusedWebhooks: {
      listen(name, token, options) {
        assert.equal(name, 'dext-receiver');
        assert.equal(token, 'execution-token');
        assert.equal(options.backendUrl, 'https://grpc.example');
        return {
          on(events, fn) {
            assert.equal(events.length, 5);
            handler = fn;
          },
        };
      },
    },
  };
  listenForStripe(
    module,
    {
      receiverName: 'dext-receiver',
      sdkToken: 'execution-token',
      grpcUrl: 'https://grpc.example',
      stripeLive: false,
    },
    {
      async receiveEvent() {
        if (failure) throw new Error('disk full');
        persisted = true;
      },
    },
  );
  const context = {
    ack() {
      assert.equal(persisted, true);
      ack++;
    },
    nack() {
      nack++;
    },
  };
  const event = { body: { id: 'evt_paid', type: 'invoice.paid', livemode: false } };
  await handler(event, context);
  assert.equal(ack, 1);
  failure = true;
  await handler(event, context);
  await handler({ body: { ...event.body, livemode: true } }, context);
  assert.equal(ack, 1);
  assert.equal(nack, 2);
});

test('webhook registration endpoint requires a separate admin token and takes no customer-selected destination', async (t) => {
  const f = setup(t);
  const server = serverFor(
    {
      billing: f.billing,
      stripeRegistration: f.registration,
      limit() {},
      exclusive(_id, fn) {
        return fn();
      },
    },
    { ...f.config, adminToken: 'private-admin' },
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/admin/stripe/webhook-registration`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
  assert.equal(
    (
      await fetch(url, {
        method: 'POST',
        headers: { authorization: 'Bearer customer-token' },
        body: '{}',
      })
    ).status,
    401,
  );
  const headers = { authorization: 'Bearer private-admin' };
  assert.equal(
    (await fetch(url, { method: 'POST', headers, body: '{"url":"https://attacker.example"}' }))
      .status,
    400,
  );
  const response = await fetch(url, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).registered, true);
  assert.equal(f.calls.length, 1);
});

test('bootstrap paginates metadata and preserves an existing verification secret', async () => {
  const stored = [],
    pages = [];
  const fused = new Fused({ apiKey: 'control', bucketId: 'bucket' }, {}, async (args) => {
    pages.push(args);
    return args.at(-1) === '0'
      ? { items: [{ key_name: 'unrelated' }], total: 2 }
      : { items: [{ key_name: 'dext_stripe_signing' }], total: 2 };
  });
  fused.storeStripeSigningSecret = async (value) => stored.push(value);
  assert.deepEqual(await fused.bootstrapStripeSigningSecret(), {
    initialized: true,
    existing: true,
  });
  assert.equal(pages.length, 2);
  assert.equal(stored.length, 0);
  fused.run = async () => ({ items: [], total: 0 });
  assert.deepEqual(await fused.bootstrapStripeSigningSecret(), {
    initialized: true,
    existing: false,
  });
  assert.equal(stored[0].length, 43);
});
