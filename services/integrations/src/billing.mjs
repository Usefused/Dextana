import { Fault, jsonFetch } from './core.mjs';
import { STRIPE_VERSION } from './stripe-webhooks.mjs';
export class Billing {
  constructor(config, sdk) {
    this.config = config;
    this.sdk = sdk;
  }
  async request(operation, options) {
    if (!this.sdk) throw new Fault(503, 'The Fused billing SDK is not configured yet.');
    try {
      const result = await this.sdk.Stripe[operation]({
        ...options,
        headers: { ...options?.headers, 'Stripe-Version': STRIPE_VERSION },
      });
      if (!result?.ok || !result.data) throw new Error('Upstream failure');
      return result.data;
    } catch {
      // Provider error bodies can contain customer data or registration secrets.
      throw new Fault(502, 'Fused could not complete the Stripe request.');
    }
  }
  async checkout(user) {
    return this.request('postCheckoutSessions', {
      mode: 'subscription',
      ...(user.customer ? { customer: user.customer } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { dext_user_id: user.id },
      subscription_data: { metadata: { dext_user_id: user.id } },
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            unit_amount: 1000,
            recurring: { interval: 'month' },
            product_data: { name: 'Dext Integrations' },
          },
          quantity: 1,
        },
      ],
      success_url: `${this.config.origin}/billing/complete`,
      cancel_url: `${this.config.origin}/billing/cancelled`,
      expires_at: Math.floor(user.checkout_expires / 1000),
      headers: { 'Idempotency-Key': `checkout-${user.id}-${user.checkout_nonce}` },
    });
  }
  async entitlement(user) {
    if (!user.subscription) return { paidUntil: 0 };
    const subscription = await this.request('getSubscriptionsSubscriptionExposedId', {
      subscription_exposed_id: user.subscription,
      expand: ['latest_invoice'],
    });
    const price = subscription.items?.data?.[0]?.price;
    const invoice = subscription.latest_invoice;
    const expected =
      subscription.id === user.subscription &&
      subscription.customer === user.customer &&
      subscription.metadata?.dext_user_id === user.id &&
      subscription.items?.data?.length === 1 &&
      subscription.items.data[0].quantity === 1 &&
      price?.currency === 'gbp' &&
      price.unit_amount === 1000 &&
      price.recurring?.interval === 'month' &&
      price.recurring.interval_count === 1;
    if (!expected) throw new Fault(502, 'Subscription identity or price could not be verified.');
    const period = subscription.items.data[0].current_period_end ?? subscription.current_period_end;
    const paid =
      subscription.status === 'active' &&
      invoice?.status === 'paid' &&
      invoice.currency === 'gbp' &&
      invoice.amount_paid >= 1000 &&
      Number.isFinite(period);
    return { paidUntil: paid ? period * 1000 : 0, status: subscription.status };
  }
  async portal(user) {
    if (!user.customer) throw new Fault(409, 'Subscribe before managing billing.');
    return this.request('postBillingPortalSessions', {
      customer: user.customer,
      return_url: `${this.config.origin}/billing/complete`,
    });
  }
}
export class Mail {
  constructor(config) {
    this.config = config;
  }
  async code(email, code) {
    if (!this.config.mailKey || !this.config.mailFrom)
      throw new Fault(503, 'Email verification is not configured yet.');
    await jsonFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.mailKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.mailFrom,
        to: [email],
        subject: 'Your Dext Integrations sign-in code',
        text: `Your Dext Integrations code is ${code}. It expires in 10 minutes. Enter it in Settings → Integrations. If you did not request this, ignore this email.`,
      }),
    });
  }
}
