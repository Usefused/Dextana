# Fused billing integration facts

Verified 9 September 2026 using fused-cli 0.29.1 and the installed CLI/Engine/generator source.

- Engine: `https://fused.run.usefused.com` (HTTP control plane; an explicit gRPC address is still required).
- Catalog MCP family: `323aa26c-ea7b-45eb-87f6-b7b6ff01aa75`; stable version resolved at runtime.
- Stripe is enabled: service `3e092174-528d-4768-8b38-9f631de38e64`, version `2026-07-29.dahlia`, version ID `7d4f1a6f-95b5-46b2-a89f-2519501c6c91`.
- Existing visible candidate bucket: `default`, ID `10d34800-a226-4b79-8905-3eed36906fb7`. No Stripe credential was listed. Visibility does not establish use permission.
- Exact selected operations: `PostCheckoutSessions`, `GetSubscriptionsSubscriptionExposedId`, `PostBillingPortalSessions`, `PostWebhookEndpoints`.
- Exact events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- Provider auth: bearer scheme `bearerAuth`. Store the Stripe key in Fused; it does not belong in this backend's environment.
- The SDK and webhook YAML files pass local CLI validation. They are unapplied drafts.
- Service-bearing SDK init was rejected during plan admission: `sdk_family_limit_exceeded`, reported 3/3 slots. No SDK version or token was created. Visible SDK family names: `wex-google-account-login`, `wex-google-identity`, `threadify`, `govee-sdk`. The discrepancy between the count and listing is unresolved.
- The TypeScript adapter follows the inspected generator contract: `FusedSDK.Stripe.postCheckoutSessions(options)` and `{ok,status,data,error}` results. Actual generated package compatibility remains unverified until generation is possible.
- `FusedWebhooks.listen(receiverName, executionToken, {backendUrl})` receives provider envelopes with `body`, and explicit ack/nack. Event enums use `StripeWebhook` and uppercase event names with dots replaced by underscores. Fused performs provider signature verification before delivery.
- Signing-secret storage uses the same `PUT /workspace/secrets` API as the CLI, with key `dext_stripe_signing`. It is referenced by `webhook.yaml`. No signing secret or provider webhook has been created yet.

Do not retry SDK admission or change existing SDKs until the quota or explicitly selected account/workspace is resolved. No live payment, email, OAuth grant or runtime token was created by this setup.
