// fused-sdk-callables: ["sdk.Stripe.checkout.getCheckoutSessions","sdk.Stripe.checkout.getCheckoutSessionsSession","sdk.Stripe.checkout.postCheckoutSessions","sdk.Stripe.customers.getCustomers","sdk.Stripe.customers.getCustomersCustomer","sdk.Stripe.customers.getCustomersSearch","sdk.Stripe.customers.postCustomers","sdk.Stripe.customers.postCustomersCustomer","sdk.Stripe.invoices.getInvoices","sdk.Stripe.invoices.getInvoicesInvoice","sdk.Stripe.invoices.getInvoicesInvoiceLines","sdk.Stripe.invoices.postInvoices","sdk.Stripe.invoices.postInvoicesCreatePreview","sdk.Stripe.invoices.postInvoicesInvoice","sdk.Stripe.prices.getPrices","sdk.Stripe.prices.getPricesPrice","sdk.Stripe.prices.postPrices","sdk.Stripe.prices.postPricesPrice","sdk.Stripe.products.getProducts","sdk.Stripe.products.getProductsId","sdk.Stripe.products.postProducts","sdk.Stripe.products.postProductsId","sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId","sdk.Stripe.subscriptions.getSubscriptions","sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId","sdk.Stripe.subscriptions.postSubscriptions","sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId","sdk.close"]
// Auto-generated. Do not edit manually.
// Powered by Fused - The integration layer for teams that want control.
// Custom SDKs, native webhooks, and MCP servers from services you actually use.
// Learn more at: https://usefused.com
//
// Regenerate by running the SDK generator with your updated integration objects.

import { StripeClient, StripeIntegrationConfig } from './Stripe';


import * as grpc from '@grpc/grpc-js';
import { EngineService } from './core';

export class FusedSDK {
  readonly Stripe: StripeClient;

  private readonly _client: any;

  constructor(config: {
    grpcUrl?: string;
    token: string;

    Stripe?: StripeIntegrationConfig;
    environments?: Record<string, string>;
  }) {
    const grpcUrl = config.grpcUrl || process.env.FUSED_ENGINE_GRPC_URL || process.env.FUSED_ENGINE_URL || "https://dextalabs-exec.run.usefused.com";
    const targetUrl = grpcUrl.replace(/^https?:\/\//, '');
    const creds = grpcUrl.startsWith('https')
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();
    this._client = new EngineService(targetUrl, creds);

    this.Stripe = new StripeClient({ ...(config.Stripe ?? {}), token: config.token }, this._client);
  }

  /** Close the shared Engine gRPC channel. Call on application shutdown. */
  close(): void {
    if (typeof this._client?.close === 'function') this._client.close();
  }
}

export { StripeClient } from './Stripe';




export * from './types';
export * from './errors';
