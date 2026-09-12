# Dextalabs integrations

Portable Fused configuration and generated Stripe SDK. Copy this directory to another project without depending on Dextana application code.

## Components and current status

- OAuth MCP: `dextalabs-integrations@2.1.0`, published, active, and selected as the stable version. [.fused/mcp-google.yaml](.fused/mcp-google.yaml) selects 35 operations from Gmail v1, Google Drive v3, Google Calendar v3, and Google OAuth2 API v2 (account-profile lookup). No Stripe operations are selected. [Open the active MCP](https://dextalabs.run.usefused.com/integrations/mcp/29c3cf29-7c58-5ef5-bdc6-7047f10d6110).
- The mistakenly published Stripe-only MCP `dextalabs-integrations@1.0.0` was permanently deactivated with user approval. [.fused/mcp.yaml](.fused/mcp.yaml) is its historical configuration; do not reapply it or use it as the OAuth hub configuration.
- TypeScript SDK: `dextalabs-stripe@1.0.0`, generated and compiled.
- Stripe source: `@martins-joseph/stripe@2026-07-29.dahlia`.
- The SDK selects 27 operations covering customers, products, prices, checkout sessions, subscriptions (including cancellation), and invoice drafts/previews. Exact selections are in [.fused/sdk.yaml](.fused/sdk.yaml).

The MCP family's stable Streamable HTTP endpoint points to the Google OAuth version `2.1.0` (version ID `29c3cf29-7c58-5ef5-bdc6-7047f10d6110`):

```text
https://dextalabs.run.usefused.com/mcp/12c5aa85-5dd8-42e4-96c5-07d2d1367f49
```

Use a Fused MCP client token as its Bearer authorization value. No additional client token has been created; client connectivity has not been tested. The earlier proposed Stripe token is no longer the intended setup.

## Connect Google OAuth

All four Google services are enabled in the workspace. Their OAuth scheme is `oauth2`, and the MCP uses the existing `default` bucket. Gmail, Drive, and Calendar reference the Google OAuth2 API application registration so only one Google client ID/secret pair needs to be maintained. Each service still needs its own connected-user grant.

Store your Google OAuth application client ID and client secret on the Google OAuth2 API service using this secure interactive command. The current Fused Credentials UI's "OAuth token" field accepts an access token, not the application client ID/secret pair, so do not use that field for this registration:

```sh
fused-cli --engine-url https://dextalabs.run.usefused.com secret set @martins-joseph/google-oauth2 --bucket default --type oauth --auth-name oauth2 --interactive
```

Fused derives the OAuth callback as:

```text
https://dextalabs.run.usefused.com/workspace/connect/callback
```

Configure that exact redirect URI for the Google application. No Google client credentials or connected-user grants were present during validation. After registration, start each service's OAuth connection with a stable `--user-ref`, and complete Google's browser consent. Use the exact `connect.scopes` from `mcp-google.yaml`. For Gmail, Drive, and Calendar, standalone `workspace service connect` also needs `--auth-ref '${bucket.auth.@martins-joseph/google-oauth2.oauth2}'` because that command does not infer the MCP configuration.

The selected scopes enable Gmail reading, drafts, sending and message/label changes; Drive reading and file changes; and Calendar metadata, availability, event creation/update/deletion. The exact operation allowlist narrows what the MCP exposes. A dynamic MCP client must send `X-Fused-End-User-Ref` for the connected Google user; a fixed-binding client token can bind that user at issuance instead.

The user approved publication of these read/write capabilities and permanent removal of the old Stripe MCP. Both actions completed. Google provider calls still require the application registration and user consent above; no Google mail, files, or events were accessed or changed during deployment. The publication receipt is saved in macOS Keychain under service `Fused Dextalabs`, account `mcp-publication-2.1.0`.

## Connect Stripe

For the separate Stripe SDK, add the Stripe API key in [Fused Credentials](https://dextalabs.run.usefused.com/integrations/buckets) to the existing `default` credential set using bearer authentication named `bearerAuth`. Enter the key directly into Fused; do not put it in source code or chat.

Alternatively, run the secure interactive CLI prompt:

```sh
fused-cli --engine-url https://dextalabs.run.usefused.com secret set @martins-joseph/stripe --bucket default --type bearer --auth-name bearerAuth --interactive
```

At setup time the bucket was empty. No Stripe API calls have been executed or provider data changed.

## Use the SDK

From this directory:

```sh
npm --prefix fused-sdks/dextalabs-stripe ci --ignore-scripts
npm --prefix fused-sdks/dextalabs-stripe run build
```

From a consuming Node.js project, install this package by its local path:

```sh
npm install /absolute/path/to/dextalabs/fused-sdks/dextalabs-stripe
```

```ts
import { FusedSDK } from "dextalabs-stripe";

const token = process.env.FUSED_SDK_TOKEN;
if (!token) throw new Error("FUSED_SDK_TOKEN is required");

const sdk = new FusedSDK({ token });
try {
  const result = await sdk.Stripe.customers.getCustomers({ limit: 10 });
  if (!result.ok) throw new Error(`Stripe request failed: ${result.status}`);
  console.log(result.data);
} finally {
  sdk.close();
}
```

The SDK embeds `https://dextalabs-exec.run.usefused.com` as its default execution endpoint. Supply the Fused SDK token, not a Stripe key. Some generated query option types are `any`; the package compiles, but those options do not have full static validation.

The SDK token is saved in this Mac's Keychain under service `Fused Dextalabs`, account `dextalabs-stripe-1.0.0`. Publication receipts, including initial one-time credentials, are saved under accounts `sdk-publication-1.0.0` and `mcp-publication-1.0.0` in the same service. Tokens are not included in this directory. Retrieve the SDK token securely into the consuming process environment; do not print or commit it.

Version `2.0.0` remains available at its pinned endpoint with the earlier Gmail-based registration; `.fused/mcp-oauth.yaml` records that immutable version. Use `mcp-google.yaml` and the stable endpoint for the current shared Google OAuth2 API registration.

## Extend the hub

Add future enabled services through a new MCP version, preserving the stable family endpoint. Generate a new SDK version when its selected operations change. Published `1.0.0` configurations are immutable; keep the YAML as the reproducible definition and use Fused plan/validate before applying a new version.
