import { randomUUID } from 'node:crypto';
import { Fault, seal, unseal } from './core.mjs';

export const STRIPE_VERSION = '2026-07-29.dahlia';
export const STRIPE_EVENTS = Object.freeze([
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export function listenForStripe(module, config, service) {
  const receiver = module.FusedWebhooks.listen(config.receiverName, config.sdkToken, {
    backendUrl: config.grpcUrl,
  });
  const events = STRIPE_EVENTS.map((event) => {
    const value = module.StripeWebhook?.[event.toUpperCase().replaceAll('.', '_')];
    if (!value) throw new Error(`Generated SDK is missing webhook ${event}.`);
    return value;
  });
  receiver.on(events, async (payload, context) => {
    // Fused verifies Stripe's signature before delivery. Its payload wraps the raw event in body.
    const event = payload?.body;
    if (!event || !STRIPE_EVENTS.includes(event.type) || event.livemode !== config.stripeLive) {
      context.nack();
      return;
    }
    try {
      await service.receiveEvent(event);
      // receiveEvent persists the reconciliation work before this acknowledgement.
      context.ack();
    } catch {
      context.nack();
    }
  });
  return receiver;
}

export class StripeRegistration {
  constructor(db, billing, config, encryptionKey, storeSecret) {
    Object.assign(this, { db, billing, config, encryptionKey, storeSecret });
  }
  async register() {
    const { webhookUrl, stripeLive } = this.config;
    if (!webhookUrl || !this.billing.sdk)
      throw new Fault(
        503,
        'Apply the Fused webhook attachment and configure the billing SDK first.',
      );
    const url = new URL(webhookUrl);
    if (
      url.origin !== this.config.engine ||
      !/^\/webhook\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new Fault(503, 'Use the Stripe ingress URL returned by Fused webhook apply.');
    let row = this.db.one('SELECT * FROM stripe_registration WHERE slot=1');
    if (row && row.url !== webhookUrl)
      throw new Fault(
        409,
        'The registered webhook URL differs. Review the existing registration first.',
      );
    if (!row) {
      this.db.run(
        'INSERT INTO stripe_registration(slot,nonce,created,url) VALUES(1,?,?,?)',
        randomUUID(),
        Date.now(),
        webhookUrl,
      );
      row = this.db.one('SELECT * FROM stripe_registration WHERE slot=1');
    }
    if (!row.endpoint_id) {
      // Stripe only retains idempotency results for at least 24h. Never retry blindly beyond that.
      if (Date.now() - row.created > 23 * 3600_000)
        throw new Fault(
          409,
          'Webhook creation is uncertain. Reconcile the Stripe endpoint before retrying.',
        );
      const endpoint = await this.billing.request('postWebhookEndpoints', {
        url: webhookUrl,
        enabled_events: [...STRIPE_EVENTS],
        api_version: STRIPE_VERSION,
        description: 'Dext Integrations subscription events',
        metadata: { dext_registration: row.nonce },
        headers: { 'Idempotency-Key': `dext-webhook-${row.nonce}` },
      });
      if (
        !endpoint.id ||
        !endpoint.secret ||
        endpoint.url !== webhookUrl ||
        endpoint.livemode !== stripeLive ||
        endpoint.api_version !== STRIPE_VERSION ||
        endpoint.status !== 'enabled' ||
        JSON.stringify([...(endpoint.enabled_events ?? [])].sort()) !==
          JSON.stringify([...STRIPE_EVENTS].sort())
      )
        throw new Fault(502, 'Stripe webhook registration could not be verified.');
      this.db.run(
        'UPDATE stripe_registration SET endpoint_id=?,ciphertext=? WHERE slot=1',
        endpoint.id,
        seal(endpoint.secret, this.encryptionKey),
      );
      row = this.db.one('SELECT * FROM stripe_registration WHERE slot=1');
    }
    if (!row.ready) {
      await this.storeSecret(unseal(row.ciphertext, this.encryptionKey));
      this.db.run('UPDATE stripe_registration SET ready=1,ciphertext=NULL WHERE slot=1');
    }
    return { registered: true, id: row.endpoint_id, url: webhookUrl, events: STRIPE_EVENTS };
  }
}
