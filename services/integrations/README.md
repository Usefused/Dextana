# Dext Integrations service

A separate Node service for the **Settings → Integrations** page. It does not run inside Electron and is not included in the desktop installer. It uses SQLite on a persistent disk and Fused CLI 0.29.1 or a compatible release. Node 24 LTS is recommended. Billing uses a separately generated Fused TypeScript SDK; its runtime dependencies are installed with that package.

The verified cloud catalog currently contains Gmail (6 operations), Google Calendar (7), and Google OAuth2 account identity (1). The service resolves the stable MCP family `323aa26c-ea7b-45eb-87f6-b7b6ff01aa75` to its exact active version, reads its operations with `fused-cli mcp operations`, joins workspace service metadata, and includes only OAuth/OIDC selections. It refreshes that catalog every five minutes. An offline public snapshot is also available in the desktop so customers can browse before this service is deployed.

## Run independently

```sh
cd services/integrations
npm run start:local
# Production: copy .env.example to .env, fill its values, then npm start
```

Local mode binds to loopback, uses the saved CLI login for read-only catalog discovery, and creates private `var/encryption-key` and `var/admin-token` files. An inherited generic `FUSED_API_KEY` does not select the local service identity; set `DEXT_FUSED_CONTROL_KEY` explicitly when enabling its control operations. Billing and email remain unavailable until configured. Local mode does not simulate payment or bypass subscription checks.

Use one running service process with a persistent `DATA_DIR`. SQLite writes, token replacement, and billing reconciliation are serialized in that process. Put it behind an HTTPS reverse proxy. The peer-address rate limiter intentionally ignores forwarding headers; configure a trusted edge rate limit if many users share a proxy address. Back up the SQLite database together with the stable encryption key. Use restrictive file permissions for `.env` and the data directory.

`FUSED_API_KEY` needs permission to read this MCP, list workspace services and the selected bucket's connection metadata, create connect sessions for its services, and manage this MCP's execution tokens. `FUSED_BUCKET_ID` must be the **exact bucket selected by liveMCP**. The service uses an isolated CLI config directory so a developer's saved login cannot override its control credential. It never grants itself additional permissions. OAuth application client credentials stay in the Engine bucket.

## Stripe through Fused

The backend has no direct Stripe REST client or public Stripe callback. `fused/sdk.yaml` selects four billing operations and five payment events from Stripe `2026-07-29.dahlia`. `fused/webhook.yaml` registers signature-verified ingress in Fused. The generated SDK's outbound gRPC stream delivers events to this backend, so localhost needs no public tunnel.

Creation is currently blocked by Fused's SDK quota. Both YAML files pass local validation, but no SDK package, execution token, or webhook registration exists yet. See `fused/FACTS.md` for the verified contract and remaining checks. Tests use a fake generated SDK; live compatibility has not been verified.

After resolving the quota:

1. Store a Stripe test key in the existing Fused bucket using `fused-cli secret set stripe --bucket default --type bearer --auth-name bearerAuth --value-stdin`. Supply the value securely via stdin; never put it in an argument or committed file.
2. For a first deployment, start locally with `DEXT_FUSED_CONTROL_KEY` and `FUSED_BUCKET_ID`, then run `npm run webhook:bootstrap`. The authenticated `/v1/admin/stripe/webhook-bootstrap` endpoint initializes the bucket secret `dext_stripe_signing` with a random bootstrap value before webhook apply; it preserves an existing key. Fused verifies incoming events against this reference; Stripe registration below replaces it with Stripe's issued signing secret.
3. Plan and apply `fused/webhook.yaml`, then plan and apply `fused/sdk.yaml` with download. Review dependency permissions and retain the one-time SDK execution token privately. The Stripe key and signing secret stay in the Engine bucket.
4. Build/install the downloaded package following its generated README. Set `FUSED_BILLING_SDK_MODULE` to its built entry point, `FUSED_BILLING_SDK_TOKEN` to the execution token, and `FUSED_ENGINE_GRPC_URL` to the Engine's actual gRPC address. Do not assume its HTTP control URL also serves gRPC. Set `FUSED_STRIPE_WEBHOOK_URL` to the exact ingress URL returned by webhook apply. Restart this service.
5. Run `npm run webhook:register`. This calls **POST `/v1/admin/stripe/webhook-registration`** with a separate administrator bearer token. The route accepts an empty object and uses only server-owned URL, event list, and API version. It creates the provider endpoint through the generated Stripe SDK and stores Stripe's signing secret in Fused via the CLI's verified control API. It returns registration metadata, never the secret.

Registration journals its idempotency key before dispatch, encrypts the returned secret while bucket storage is pending, and resumes storage after failure without creating a second endpoint. It refuses to replay an uncertain creation after Stripe's idempotency retention window. Repeating a completed registration returns its stored receipt; it does not verify or repair later manual changes in Stripe. Changing the ingress URL requires operator reconciliation.

Webhook envelopes are acknowledged only after the event handler stores its reconciliation work in SQLite; handler failures are negatively acknowledged. Fused owns signature verification and delivery retries. The closed `/v1/stripe/webhook` route rejects direct submissions. The service independently re-fetches the subscription through the SDK before granting access.

Use test-mode Stripe credentials first; set `STRIPE_LIVE=true` only for a live deployment. Checkout creates a GBP 10 monthly subscription using server-owned price data. Enable the Stripe billing portal for the account. Configure `RESEND_API_KEY` and `MAIL_FROM` with a verified sending domain for email verification. No credentials are returned until the email code is verified.

`GET /v1/admin/status`, with the administrator token, reports configured components and the stored registration state. `/health` reports process availability only.

Set **only the public service origin** in the desktop launch environment:

```sh
DEXT_INTEGRATIONS_URL=https://integrations.your-domain.example npm start
```

Development desktop builds default to `http://127.0.0.1:8787` when this override is absent. Packaged builds require an explicit service origin. Settings distinguishes an unreachable backend from a connected backend whose subscriptions are still being configured; Refresh status retries discovery while keeping the catalog browsable. The public catalog includes separate subscription and sign-in availability flags.

This is a deployment setting, not a secret. Do not place the service's Stripe, mail, encryption or Fused control keys in the desktop. The desktop stores its customer session in the OS keyring and keeps short-lived execution tokens out of renderer state and transcripts. It obtains current credentials before managed Fused calls, so expired tokens can be replaced without putting the CLI or billing system on the customer's machine.

## Lifecycle and boundaries

1. Anyone can browse providers and their operations. Registration asks for username and email and opens Stripe Checkout. An existing subscriber is sent a sign-in code instead of being charged a second subscription.
2. Email verification authenticates the account. Dext creates a server-owned `Personal` identity. Each enabled provider receives a default account slot that reuses the legacy immutable Fused user reference, preserving existing grants. Additional logins for the same provider receive independent opaque references. The client can select only account IDs owned by its authenticated Dext account; it never supplies or reads a Fused user reference.
3. Signed Stripe webhooks enter a durable inbox. The service fetches the current Stripe subscription instead of trusting event order or the checkout success page. Access requires the exact GBP monthly subscription and a paid invoice. Billing is rechecked on use and during background reconciliation.
4. Enabling a provider records its exact service scope and creates its first account slot. Connect account starts the Engine's OAuth flow for that service, auth scheme, scopes, bucket and selected slot's server-derived user reference. A user can add and select several account slots for one provider without changing another provider's selection. The CLI's connect command has no structured output, so this one action uses its verified Engine GraphQL `startConnectSession` API, without scraping CLI text.
5. After OAuth, Activate connections issues an execution token through `fused-cli mcp token generate` with explicit operation IDs and one `--fixed-binding` per enabled provider, using that provider's selected account reference. If a chat first uses a selected account that still needs OAuth, the desktop opens its connection flow and asks the user to return after consent. It does not replay the provider operation.
6. The CLI cannot create a fixed token for a nonexistent OAuth grant and has no token-scope update command. Payment therefore unlocks the subscription; the execution token is issued after OAuth. Changes revoke the previous token before issuing a replacement. No wildcard or dynamic-selector token is used as a fallback. Fixed bindings prevent a caller from substituting someone else's user reference or resource headers.
7. Tokens expire within 15 minutes and never beyond the current paid period. Uncertain issuance and failed revocations are journaled before dispatch and retried after restart. Cancellation or failed payment revokes outstanding tokens. During an Engine/network outage, an already issued token can remain usable until its short expiry; the service refuses new credentials when it cannot validate billing.

Provider-account selection and provider-resource selection are deliberately separate. Distinct OAuth logins use separate Dext account slots and Fused user references. Several tenants or sites reachable through one OAuth login continue to use one account slot plus Fused resource selection. The latter still needs a resource-selection UI before a multi-resource provider can be offered reliably; fixed issuance fails closed when resource selection is ambiguous. The current live Google integrations do not require that additional UI.

## Verification

```sh
npm test
npm run catalog:sync
```

`catalog:sync` is a read-only cloud inspection using the CLI's existing login, useful for refreshing the checked-in catalog snapshot. Production startup uses the isolated service credential instead. Backend tests use in-memory SQLite, fake billing/email/Fused adapters and a local HTTP listener; they do not charge, send email, create OAuth grants or mint live tokens. Desktop coverage is in `../../desktop/tests/e2e/integrations.spec.ts`.

The service runs locally. Subscriptions still require the Fused quota to be resolved, SDK generation/download and live contract verification, Stripe bucket credentials, the gRPC address, a service control credential, email configuration, and webhook registration.

API reference: public `GET /v1/catalog`; registration `POST /v1/register`, `/v1/login`, `/v1/verify`; authenticated `GET /v1/account` and `POST /v1/checkout`, `/v1/billing`, `/v1/providers/enable`, `/v1/providers/connect`, `/v1/provider-accounts/add`, `/v1/provider-accounts/select`, `/v1/credentials`, `/v1/logout`. Authentication uses a bearer session token. Provider-account IDs are always checked against the authenticated user and provider. No user ID, email, username or userRef supplied to protected operations selects the Dext account.

Contracts checked against [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Stripe webhook verification](https://docs.stripe.com/webhooks), and [Resend's email API](https://resend.com/docs/api-reference/emails/send-email), plus the locally installed Fused CLI help and its Engine API source.
