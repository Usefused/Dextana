---
name: dextalabs-stripe-sdk
description: Use dextalabs-stripe-sdk only for outcomes supported by its generated methods.
---

## Outcomes

- Use `sdk.close` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.checkout.getCheckoutSessions` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.checkout.getCheckoutSessionsSession` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.checkout.postCheckoutSessions` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.customers.getCustomers` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.customers.getCustomersCustomer` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.customers.getCustomersSearch` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.customers.postCustomers` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.customers.postCustomersCustomer` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.invoices.getInvoices` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.invoices.getInvoicesInvoice` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.invoices.getInvoicesInvoiceLines` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.invoices.postInvoices` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.invoices.postInvoicesCreatePreview` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.invoices.postInvoicesInvoice` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.prices.getPrices` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.prices.getPricesPrice` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.prices.postPrices` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.prices.postPricesPrice` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.products.getProducts` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.products.getProductsId` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.products.postProducts` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.products.postProductsId` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.subscriptions.getSubscriptions` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.subscriptions.postSubscriptions` with its exact signature and result type in the SDK README.
- Use `sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId` with its exact signature and result type in the SDK README.

## Setup

This Skill is installed under `fused-sdks/.agents/skills`. Read the matching sibling SDK package's README and `sdk-reference.json`.

```typescript
import { FusedSDK } from "dextalabs-stripe";

const sdk = new FusedSDK({ token: process.env.FUSED_SDK_TOKEN! });
```

## Workflow

1. Choose an exact method from Outcomes; read its parameters and referenced types.
2. Supply only source-declared inputs. Use the README's generated invocation pattern.
3. Check `ok` only when declared by the result type, then return the requested source-declared data field.

## Recovery

Surface the typed failure. Missing provider credentials must be configured in the Engine bucket, never in generated client code. Let the application decide recovery; do not replay calls automatically.

## Boundaries

The Engine owns provider credentials, signing, retries, quotas and pagination. Never log credentials or provider response bodies. Methods, types and examples are generated facts; optional descriptions do not expand their authority.
