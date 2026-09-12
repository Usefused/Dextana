import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadBillingSDK(config) {
  if (!config.sdkModule || !config.sdkToken || !config.grpcUrl) return {};
  // This is an operator-owned module path, never an HTTP or customer-supplied value.
  const module = await import(pathToFileURL(resolve(config.sdkModule)).href);
  const sdk = new module.FusedSDK({
    grpcUrl: config.grpcUrl,
    token: config.sdkToken,
    timeoutMs: 20_000,
  });
  for (const name of [
    'postCheckoutSessions',
    'getSubscriptionsSubscriptionExposedId',
    'postBillingPortalSessions',
    'postWebhookEndpoints',
  ]) {
    if (typeof sdk.Stripe?.[name] !== 'function') {
      sdk.close();
      throw new Error(`The generated billing SDK is missing Stripe.${name}.`);
    }
  }
  if (!module.FusedWebhooks || !module.StripeWebhook) {
    sdk.close();
    throw new Error('The generated billing SDK is missing its Stripe webhook attachment.');
  }
  return { sdk, module };
}
