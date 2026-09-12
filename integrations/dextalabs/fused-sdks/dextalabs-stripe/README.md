# dextalabs-stripe

Version: 1.0.0

## Installation

From the CLI download output directory:

```shell
npm --prefix './fused-sdks/dextalabs-stripe' install
npm --prefix './fused-sdks/dextalabs-stripe' run build
```

Then install the built package into your application (adjust its relative path if needed):

```shell
npm install './fused-sdks/dextalabs-stripe'
```

## Initialize

```typescript
import { FusedSDK } from "dextalabs-stripe";

const sdk = new FusedSDK({ token: process.env.FUSED_SDK_TOKEN! });
```

The immutable app version is embedded. Provider credentials remain in the Engine bucket; never pass them to this client. Close the SDK channel at application shutdown using its generated close method.

## Operations

### Checkout Sessions

- `sdk.Stripe.checkout.getCheckoutSessions`
- `sdk.Stripe.checkout.getCheckoutSessionsSession`
- `sdk.Stripe.checkout.postCheckoutSessions`

### Customers

- `sdk.Stripe.customers.getCustomers`
- `sdk.Stripe.customers.getCustomersCustomer`
- `sdk.Stripe.customers.getCustomersSearch`
- `sdk.Stripe.customers.postCustomers`
- `sdk.Stripe.customers.postCustomersCustomer`

### Invoices

- `sdk.Stripe.invoices.getInvoices`
- `sdk.Stripe.invoices.getInvoicesInvoice`
- `sdk.Stripe.invoices.getInvoicesInvoiceLines`
- `sdk.Stripe.invoices.postInvoices`
- `sdk.Stripe.invoices.postInvoicesCreatePreview`
- `sdk.Stripe.invoices.postInvoicesInvoice`

### Prices

- `sdk.Stripe.prices.getPrices`
- `sdk.Stripe.prices.getPricesPrice`
- `sdk.Stripe.prices.postPrices`
- `sdk.Stripe.prices.postPricesPrice`

### Products

- `sdk.Stripe.products.getProducts`
- `sdk.Stripe.products.getProductsId`
- `sdk.Stripe.products.postProducts`
- `sdk.Stripe.products.postProductsId`

### Subscriptions

- `sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId`
- `sdk.Stripe.subscriptions.getSubscriptions`
- `sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId`
- `sdk.Stripe.subscriptions.postSubscriptions`
- `sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId`

### Engine Lifecycle

- `sdk.close`

### sdk.close

Closes the shared gRPC channel on shutdown.

```typescript
sdk.close(): void
```

Source: src/index.ts


Returns: void

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.close>) {
  return await sdk.close(...args);
}
```

### sdk.Stripe.checkout.getCheckoutSessions

Lists Checkout Sessions.

```typescript
sdk.Stripe.checkout.getCheckoutSessions(options: GetCheckoutSessionsOptions): Promise<GetCheckoutSessionsResponse>
```

Source: src/Stripe.ts

- options (required): GetCheckoutSessionsOptions

Returns: Promise&lt;GetCheckoutSessionsResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.checkout.getCheckoutSessions>) {
  return await sdk.Stripe.checkout.getCheckoutSessions(...args);
}
```

### sdk.Stripe.checkout.getCheckoutSessionsSession

Retrieves a Checkout Session by ID.

```typescript
sdk.Stripe.checkout.getCheckoutSessionsSession(options: GetCheckoutSessionsSessionOptions): Promise<GetCheckoutSessionsSessionResponse>
```

Source: src/Stripe.ts

- options (required): GetCheckoutSessionsSessionOptions

Returns: Promise&lt;GetCheckoutSessionsSessionResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.checkout.getCheckoutSessionsSession>) {
  return await sdk.Stripe.checkout.getCheckoutSessionsSession(...args);
}
```

### sdk.Stripe.checkout.postCheckoutSessions

Creates a new Checkout Session.

```typescript
sdk.Stripe.checkout.postCheckoutSessions(options?: PostCheckoutSessionsOptions): Promise<PostCheckoutSessionsResponse>
```

Source: src/Stripe.ts

- options (optional): PostCheckoutSessionsOptions

Returns: Promise&lt;PostCheckoutSessionsResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.checkout.postCheckoutSessions>) {
  return await sdk.Stripe.checkout.postCheckoutSessions(...args);
}
```

### sdk.Stripe.customers.getCustomers

Lists customers, newest first.

```typescript
sdk.Stripe.customers.getCustomers(options: GetCustomersOptions): Promise<GetCustomersResponse>
```

Source: src/Stripe.ts

- options (required): GetCustomersOptions

Returns: Promise&lt;GetCustomersResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.customers.getCustomers>) {
  return await sdk.Stripe.customers.getCustomers(...args);
}
```

### sdk.Stripe.customers.getCustomersCustomer

Retrieves a customer by ID.

```typescript
sdk.Stripe.customers.getCustomersCustomer(options: GetCustomersCustomerOptions): Promise<GetCustomersCustomerResponse>
```

Source: src/Stripe.ts

- options (required): GetCustomersCustomerOptions

Returns: Promise&lt;GetCustomersCustomerResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.customers.getCustomersCustomer>) {
  return await sdk.Stripe.customers.getCustomersCustomer(...args);
}
```

### sdk.Stripe.customers.getCustomersSearch

Searches for customers using Stripe's query language.

```typescript
sdk.Stripe.customers.getCustomersSearch(options: GetCustomersSearchOptions): Promise<GetCustomersSearchResponse>
```

Source: src/Stripe.ts

- options (required): GetCustomersSearchOptions

Returns: Promise&lt;GetCustomersSearchResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.customers.getCustomersSearch>) {
  return await sdk.Stripe.customers.getCustomersSearch(...args);
}
```

### sdk.Stripe.customers.postCustomers

Creates a new customer.

```typescript
sdk.Stripe.customers.postCustomers(options?: PostCustomersOptions): Promise<PostCustomersResponse>
```

Source: src/Stripe.ts

- options (optional): PostCustomersOptions

Returns: Promise&lt;PostCustomersResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.customers.postCustomers>) {
  return await sdk.Stripe.customers.postCustomers(...args);
}
```

### sdk.Stripe.customers.postCustomersCustomer

Updates a customer's details.

```typescript
sdk.Stripe.customers.postCustomersCustomer(options: PostCustomersCustomerOptions): Promise<PostCustomersCustomerResponse>
```

Source: src/Stripe.ts

- options (required): PostCustomersCustomerOptions

Returns: Promise&lt;PostCustomersCustomerResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.customers.postCustomersCustomer>) {
  return await sdk.Stripe.customers.postCustomersCustomer(...args);
}
```

### sdk.Stripe.invoices.getInvoices

Lists invoices, newest first.

```typescript
sdk.Stripe.invoices.getInvoices(options: GetInvoicesOptions): Promise<GetInvoicesResponse>
```

Source: src/Stripe.ts

- options (required): GetInvoicesOptions

Returns: Promise&lt;GetInvoicesResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.invoices.getInvoices>) {
  return await sdk.Stripe.invoices.getInvoices(...args);
}
```

### sdk.Stripe.invoices.getInvoicesInvoice

Retrieves an invoice by ID.

```typescript
sdk.Stripe.invoices.getInvoicesInvoice(options: GetInvoicesInvoiceOptions): Promise<GetInvoicesInvoiceResponse>
```

Source: src/Stripe.ts

- options (required): GetInvoicesInvoiceOptions

Returns: Promise&lt;GetInvoicesInvoiceResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.invoices.getInvoicesInvoice>) {
  return await sdk.Stripe.invoices.getInvoicesInvoice(...args);
}
```

### sdk.Stripe.invoices.getInvoicesInvoiceLines

Lists the line items of an invoice.

```typescript
sdk.Stripe.invoices.getInvoicesInvoiceLines(options: GetInvoicesInvoiceLinesOptions): Promise<GetInvoicesInvoiceLinesResponse>
```

Source: src/Stripe.ts

- options (required): GetInvoicesInvoiceLinesOptions

Returns: Promise&lt;GetInvoicesInvoiceLinesResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.invoices.getInvoicesInvoiceLines>) {
  return await sdk.Stripe.invoices.getInvoicesInvoiceLines(...args);
}
```

### sdk.Stripe.invoices.postInvoices

Creates a draft invoice for a customer.

```typescript
sdk.Stripe.invoices.postInvoices(options?: PostInvoicesOptions): Promise<PostInvoicesResponse>
```

Source: src/Stripe.ts

- options (optional): PostInvoicesOptions

Returns: Promise&lt;PostInvoicesResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.invoices.postInvoices>) {
  return await sdk.Stripe.invoices.postInvoices(...args);
}
```

### sdk.Stripe.invoices.postInvoicesCreatePreview

Previews the upcoming invoice for a subscription.

```typescript
sdk.Stripe.invoices.postInvoicesCreatePreview(options?: PostInvoicesCreatePreviewOptions): Promise<PostInvoicesCreatePreviewResponse>
```

Source: src/Stripe.ts

- options (optional): PostInvoicesCreatePreviewOptions

Returns: Promise&lt;PostInvoicesCreatePreviewResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.invoices.postInvoicesCreatePreview>) {
  return await sdk.Stripe.invoices.postInvoicesCreatePreview(...args);
}
```

### sdk.Stripe.invoices.postInvoicesInvoice

Updates an invoice (draft invoices are editable).

```typescript
sdk.Stripe.invoices.postInvoicesInvoice(options: PostInvoicesInvoiceOptions): Promise<PostInvoicesInvoiceResponse>
```

Source: src/Stripe.ts

- options (required): PostInvoicesInvoiceOptions

Returns: Promise&lt;PostInvoicesInvoiceResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.invoices.postInvoicesInvoice>) {
  return await sdk.Stripe.invoices.postInvoicesInvoice(...args);
}
```

### sdk.Stripe.prices.getPrices

Lists active prices.

```typescript
sdk.Stripe.prices.getPrices(options: GetPricesOptions): Promise<GetPricesResponse>
```

Source: src/Stripe.ts

- options (required): GetPricesOptions

Returns: Promise&lt;GetPricesResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.prices.getPrices>) {
  return await sdk.Stripe.prices.getPrices(...args);
}
```

### sdk.Stripe.prices.getPricesPrice

Retrieves a price by ID.

```typescript
sdk.Stripe.prices.getPricesPrice(options: GetPricesPriceOptions): Promise<GetPricesPriceResponse>
```

Source: src/Stripe.ts

- options (required): GetPricesPriceOptions

Returns: Promise&lt;GetPricesPriceResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.prices.getPricesPrice>) {
  return await sdk.Stripe.prices.getPricesPrice(...args);
}
```

### sdk.Stripe.prices.postPrices

Creates a new price for a product.

```typescript
sdk.Stripe.prices.postPrices(options: PostPricesOptions): Promise<PostPricesResponse>
```

Source: src/Stripe.ts

- options (required): PostPricesOptions

Returns: Promise&lt;PostPricesResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.prices.postPrices>) {
  return await sdk.Stripe.prices.postPrices(...args);
}
```

### sdk.Stripe.prices.postPricesPrice

Updates a price's details.

```typescript
sdk.Stripe.prices.postPricesPrice(options: PostPricesPriceOptions): Promise<PostPricesPriceResponse>
```

Source: src/Stripe.ts

- options (required): PostPricesPriceOptions

Returns: Promise&lt;PostPricesPriceResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.prices.postPricesPrice>) {
  return await sdk.Stripe.prices.postPricesPrice(...args);
}
```

### sdk.Stripe.products.getProducts

Lists products, newest first.

```typescript
sdk.Stripe.products.getProducts(options: GetProductsOptions): Promise<GetProductsResponse>
```

Source: src/Stripe.ts

- options (required): GetProductsOptions

Returns: Promise&lt;GetProductsResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.products.getProducts>) {
  return await sdk.Stripe.products.getProducts(...args);
}
```

### sdk.Stripe.products.getProductsId

Retrieves a product by ID.

```typescript
sdk.Stripe.products.getProductsId(options: GetProductsIdOptions): Promise<GetProductsIdResponse>
```

Source: src/Stripe.ts

- options (required): GetProductsIdOptions

Returns: Promise&lt;GetProductsIdResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.products.getProductsId>) {
  return await sdk.Stripe.products.getProductsId(...args);
}
```

### sdk.Stripe.products.postProducts

Creates a new product.

```typescript
sdk.Stripe.products.postProducts(options: PostProductsOptions): Promise<PostProductsResponse>
```

Source: src/Stripe.ts

- options (required): PostProductsOptions

Returns: Promise&lt;PostProductsResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.products.postProducts>) {
  return await sdk.Stripe.products.postProducts(...args);
}
```

### sdk.Stripe.products.postProductsId

Updates a product's details.

```typescript
sdk.Stripe.products.postProductsId(options: PostProductsIdOptions): Promise<PostProductsIdResponse>
```

Source: src/Stripe.ts

- options (required): PostProductsIdOptions

Returns: Promise&lt;PostProductsIdResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.products.postProductsId>) {
  return await sdk.Stripe.products.postProductsId(...args);
}
```

### sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId

Cancels a subscription immediately.

```typescript
sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId(options: DeleteSubscriptionsSubscriptionExposedIdOptions): Promise<DeleteSubscriptionsSubscriptionExposedIdResponse>
```

Source: src/Stripe.ts

- options (required): DeleteSubscriptionsSubscriptionExposedIdOptions

Returns: Promise&lt;DeleteSubscriptionsSubscriptionExposedIdResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId>) {
  return await sdk.Stripe.subscriptions.deleteSubscriptionsSubscriptionExposedId(...args);
}
```

### sdk.Stripe.subscriptions.getSubscriptions

Lists subscriptions (optionally canceled).

```typescript
sdk.Stripe.subscriptions.getSubscriptions(options: GetSubscriptionsOptions): Promise<GetSubscriptionsResponse>
```

Source: src/Stripe.ts

- options (required): GetSubscriptionsOptions

Returns: Promise&lt;GetSubscriptionsResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.subscriptions.getSubscriptions>) {
  return await sdk.Stripe.subscriptions.getSubscriptions(...args);
}
```

### sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId

Retrieves a subscription by ID.

```typescript
sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId(options: GetSubscriptionsSubscriptionExposedIdOptions): Promise<GetSubscriptionsSubscriptionExposedIdResponse>
```

Source: src/Stripe.ts

- options (required): GetSubscriptionsSubscriptionExposedIdOptions

Returns: Promise&lt;GetSubscriptionsSubscriptionExposedIdResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId>) {
  return await sdk.Stripe.subscriptions.getSubscriptionsSubscriptionExposedId(...args);
}
```

### sdk.Stripe.subscriptions.postSubscriptions

Creates a new subscription for a customer.

```typescript
sdk.Stripe.subscriptions.postSubscriptions(options?: PostSubscriptionsOptions): Promise<PostSubscriptionsResponse>
```

Source: src/Stripe.ts

- options (optional): PostSubscriptionsOptions

Returns: Promise&lt;PostSubscriptionsResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.subscriptions.postSubscriptions>) {
  return await sdk.Stripe.subscriptions.postSubscriptions(...args);
}
```

### sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId

Updates a subscription, with optional proration.

```typescript
sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId(options: PostSubscriptionsSubscriptionExposedIdOptions): Promise<PostSubscriptionsSubscriptionExposedIdResponse>
```

Source: src/Stripe.ts

- options (required): PostSubscriptionsSubscriptionExposedIdOptions

Returns: Promise&lt;PostSubscriptionsSubscriptionExposedIdResponse&gt;

```typescript
async function example(sdk: FusedSDK, ...args: Parameters<typeof sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId>) {
  return await sdk.Stripe.subscriptions.postSubscriptionsSubscriptionExposedId(...args);
}
```

## Results and errors

Use the exact return type below. When it declares an `ok` discriminator, check it before reading `data`; otherwise consume the declared result directly. Engine owns authentication, signing, retries, quotas and pagination. Do not automatically replay failed calls.

## Types

### FusedExecutionOptions

Source: src/core.ts

```typescript
export interface FusedExecutionOptions {
  endUserRef?: string;
  authType?: 'basic' | 'bearer' | 'api_key' | 'oauth' | 'oidc' | 'mtls';
  authName?: string;
  resourceId?: string;
  pagination?: FusedPaginationOptions;
}
```

### FusedPaginationOptions

Source: src/core.ts

```typescript
export interface FusedPaginationOptions {
  maxPages: number;
}
```

### SDKConfig

Source: src/core.ts

```typescript
export interface SDKConfig {
  grpcUrl?: string;               // Engine gRPC target, e.g. http://localhost:50051
  headers?: Record<string, string>; // SDK-wide global headers
  timeoutMs?: number;               // default 30000
  streamIdleTimeoutMs?: number;     // disabled when omitted
  maxStreamDurationMs?: number;     // disabled when omitted
  debug?: boolean;                  // log requests/responses
  // Family-scoped SDK execution token sent on Connect/Execute.
  token?: string;
  // Provider credentials forwarded to the Engine on every call and used
  // in-flight only (never persisted) — see ExecuteRequest.credentials. Keys
  // match what the Engine's applyAuth expects: "Authorization", "username"/
  // "password", or the apiKey key name for the provider.
  credentials?: Record<string, string>;
}
```

### DeleteSubscriptionsSubscriptionExposedIdErrorResult

Source: src/Stripe.ts

```typescript
export type DeleteSubscriptionsSubscriptionExposedIdErrorResult = Error;
```

### DeleteSubscriptionsSubscriptionExposedIdOptions

Source: src/Stripe.ts

```typescript
export interface DeleteSubscriptionsSubscriptionExposedIdOptions {
  'subscription_exposed_id': string;
  'cancellation_details'?: {
    'comment'?: Record<string, any>;
    'feedback'?: string;
  };
  'expand'?: string[];
  'invoice_now'?: boolean;
  'prorate'?: boolean;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### DeleteSubscriptionsSubscriptionExposedIdResponse

Source: src/Stripe.ts

```typescript
export type DeleteSubscriptionsSubscriptionExposedIdResponse =
  | { ok: true; status: number; data: DeleteSubscriptionsSubscriptionExposedIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: DeleteSubscriptionsSubscriptionExposedIdErrorResult };
```

### DeleteSubscriptionsSubscriptionExposedIdSuccessResult

Source: src/Stripe.ts

```typescript
export type DeleteSubscriptionsSubscriptionExposedIdSuccessResult = Subscription;
```

### GetCheckoutSessionsErrorResult

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsErrorResult = Error;
```

### GetCheckoutSessionsOptions

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsOptions = any;
```

### GetCheckoutSessionsResponse

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsResponse =
  | { ok: true; status: number; data: GetCheckoutSessionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCheckoutSessionsErrorResult };
```

### GetCheckoutSessionsSessionErrorResult

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsSessionErrorResult = Error;
```

### GetCheckoutSessionsSessionOptions

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsSessionOptions = any;
```

### GetCheckoutSessionsSessionResponse

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsSessionResponse =
  | { ok: true; status: number; data: GetCheckoutSessionsSessionSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCheckoutSessionsSessionErrorResult };
```

### GetCheckoutSessionsSessionSuccessResult

Source: src/Stripe.ts

```typescript
export type GetCheckoutSessionsSessionSuccessResult = CheckoutSession;
```

### GetCheckoutSessionsSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetCheckoutSessionsSuccessResult {
  'data': CheckoutSession[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### GetCustomersCustomerErrorResult

Source: src/Stripe.ts

```typescript
export type GetCustomersCustomerErrorResult = Error;
```

### GetCustomersCustomerOptions

Source: src/Stripe.ts

```typescript
export type GetCustomersCustomerOptions = any;
```

### GetCustomersCustomerResponse

Source: src/Stripe.ts

```typescript
export type GetCustomersCustomerResponse =
  | { ok: true; status: number; data: GetCustomersCustomerSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCustomersCustomerErrorResult };
```

### GetCustomersCustomerSuccessResult

Source: src/Stripe.ts

```typescript
export type GetCustomersCustomerSuccessResult = Record<string, any>;
```

### GetCustomersErrorResult

Source: src/Stripe.ts

```typescript
export type GetCustomersErrorResult = Error;
```

### GetCustomersOptions

Source: src/Stripe.ts

```typescript
export type GetCustomersOptions = any;
```

### GetCustomersResponse

Source: src/Stripe.ts

```typescript
export type GetCustomersResponse =
  | { ok: true; status: number; data: GetCustomersSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCustomersErrorResult };
```

### GetCustomersSearchErrorResult

Source: src/Stripe.ts

```typescript
export type GetCustomersSearchErrorResult = Error;
```

### GetCustomersSearchOptions

Source: src/Stripe.ts

```typescript
export type GetCustomersSearchOptions = any;
```

### GetCustomersSearchResponse

Source: src/Stripe.ts

```typescript
export type GetCustomersSearchResponse =
  | { ok: true; status: number; data: GetCustomersSearchSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetCustomersSearchErrorResult };
```

### GetCustomersSearchSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetCustomersSearchSuccessResult {
  'data': Customer[];
  'has_more': boolean;
  'next_page'?: string;
  'object': string;
  'total_count'?: number;
  'url': string;
}
```

### GetCustomersSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetCustomersSuccessResult {
  'data': Customer[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### GetInvoicesErrorResult

Source: src/Stripe.ts

```typescript
export type GetInvoicesErrorResult = Error;
```

### GetInvoicesInvoiceErrorResult

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceErrorResult = Error;
```

### GetInvoicesInvoiceLinesErrorResult

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceLinesErrorResult = Error;
```

### GetInvoicesInvoiceLinesOptions

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceLinesOptions = any;
```

### GetInvoicesInvoiceLinesResponse

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceLinesResponse =
  | { ok: true; status: number; data: GetInvoicesInvoiceLinesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetInvoicesInvoiceLinesErrorResult };
```

### GetInvoicesInvoiceLinesSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetInvoicesInvoiceLinesSuccessResult {
  'data': LineItem[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### GetInvoicesInvoiceOptions

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceOptions = any;
```

### GetInvoicesInvoiceResponse

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceResponse =
  | { ok: true; status: number; data: GetInvoicesInvoiceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetInvoicesInvoiceErrorResult };
```

### GetInvoicesInvoiceSuccessResult

Source: src/Stripe.ts

```typescript
export type GetInvoicesInvoiceSuccessResult = Invoice;
```

### GetInvoicesOptions

Source: src/Stripe.ts

```typescript
export type GetInvoicesOptions = any;
```

### GetInvoicesResponse

Source: src/Stripe.ts

```typescript
export type GetInvoicesResponse =
  | { ok: true; status: number; data: GetInvoicesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetInvoicesErrorResult };
```

### GetInvoicesSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetInvoicesSuccessResult {
  'data': Invoice[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### GetPricesErrorResult

Source: src/Stripe.ts

```typescript
export type GetPricesErrorResult = Error;
```

### GetPricesOptions

Source: src/Stripe.ts

```typescript
export type GetPricesOptions = any;
```

### GetPricesPriceErrorResult

Source: src/Stripe.ts

```typescript
export type GetPricesPriceErrorResult = Error;
```

### GetPricesPriceOptions

Source: src/Stripe.ts

```typescript
export type GetPricesPriceOptions = any;
```

### GetPricesPriceResponse

Source: src/Stripe.ts

```typescript
export type GetPricesPriceResponse =
  | { ok: true; status: number; data: GetPricesPriceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetPricesPriceErrorResult };
```

### GetPricesPriceSuccessResult

Source: src/Stripe.ts

```typescript
export type GetPricesPriceSuccessResult = Price;
```

### GetPricesResponse

Source: src/Stripe.ts

```typescript
export type GetPricesResponse =
  | { ok: true; status: number; data: GetPricesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetPricesErrorResult };
```

### GetPricesSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetPricesSuccessResult {
  'data': Price[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### GetProductsErrorResult

Source: src/Stripe.ts

```typescript
export type GetProductsErrorResult = Error;
```

### GetProductsIdErrorResult

Source: src/Stripe.ts

```typescript
export type GetProductsIdErrorResult = Error;
```

### GetProductsIdOptions

Source: src/Stripe.ts

```typescript
export type GetProductsIdOptions = any;
```

### GetProductsIdResponse

Source: src/Stripe.ts

```typescript
export type GetProductsIdResponse =
  | { ok: true; status: number; data: GetProductsIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetProductsIdErrorResult };
```

### GetProductsIdSuccessResult

Source: src/Stripe.ts

```typescript
export type GetProductsIdSuccessResult = Product;
```

### GetProductsOptions

Source: src/Stripe.ts

```typescript
export type GetProductsOptions = any;
```

### GetProductsResponse

Source: src/Stripe.ts

```typescript
export type GetProductsResponse =
  | { ok: true; status: number; data: GetProductsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetProductsErrorResult };
```

### GetProductsSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetProductsSuccessResult {
  'data': Product[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### GetSubscriptionsErrorResult

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsErrorResult = Error;
```

### GetSubscriptionsOptions

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsOptions = any;
```

### GetSubscriptionsResponse

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsResponse =
  | { ok: true; status: number; data: GetSubscriptionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetSubscriptionsErrorResult };
```

### GetSubscriptionsSubscriptionExposedIdErrorResult

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsSubscriptionExposedIdErrorResult = Error;
```

### GetSubscriptionsSubscriptionExposedIdOptions

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsSubscriptionExposedIdOptions = any;
```

### GetSubscriptionsSubscriptionExposedIdResponse

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsSubscriptionExposedIdResponse =
  | { ok: true; status: number; data: GetSubscriptionsSubscriptionExposedIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: GetSubscriptionsSubscriptionExposedIdErrorResult };
```

### GetSubscriptionsSubscriptionExposedIdSuccessResult

Source: src/Stripe.ts

```typescript
export type GetSubscriptionsSubscriptionExposedIdSuccessResult = Subscription;
```

### GetSubscriptionsSuccessResult

Source: src/Stripe.ts

```typescript
export interface GetSubscriptionsSuccessResult {
  'data': Subscription[];
  'has_more': boolean;
  'object': string;
  'url': string;
}
```

### PostCheckoutSessionsErrorResult

Source: src/Stripe.ts

```typescript
export type PostCheckoutSessionsErrorResult = Error;
```

### PostCheckoutSessionsOptions

Source: src/Stripe.ts

```typescript
export interface PostCheckoutSessionsOptions {
  'adaptive_pricing'?: {
    'enabled'?: boolean;
  };
  'after_expiration'?: {
    'recovery'?: {
      'allow_promotion_codes'?: boolean;
      'enabled': boolean;
    };
  };
  'allow_promotion_codes'?: boolean;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'billing_address_collection'?: string;
  'branding_settings'?: {
    'background_color'?: Record<string, any>;
    'border_style'?: string;
    'button_color'?: Record<string, any>;
    'display_name'?: string;
    'font_family'?: string;
    'icon'?: {
      'file'?: string;
      'type': string;
      'url'?: string;
    };
    'logo'?: {
      'file'?: string;
      'type': string;
      'url'?: string;
    };
  };
  'cancel_url'?: string;
  'client_reference_id'?: string;
  'consent_collection'?: {
    'payment_method_reuse_agreement'?: {
      'position': string;
    };
    'promotions'?: string;
    'terms_of_service'?: string;
  };
  'currency'?: string;
  'custom_fields'?: {
    'dropdown'?: {
      'default_value'?: string;
      'options': {
        'label': string;
        'value': string;
      }[];
    };
    'key': string;
    'label': {
      'custom': string;
      'type': string;
    };
    'numeric'?: {
      'default_value'?: string;
      'maximum_length'?: number;
      'minimum_length'?: number;
    };
    'optional'?: boolean;
    'text'?: {
      'default_value'?: string;
      'maximum_length'?: number;
      'minimum_length'?: number;
    };
    'type': string;
  }[];
  'custom_text'?: {
    'after_submit'?: Record<string, any>;
    'shipping_address'?: Record<string, any>;
    'submit'?: Record<string, any>;
    'terms_of_service_acceptance'?: Record<string, any>;
  };
  'customer'?: string;
  'customer_account'?: string;
  'customer_creation'?: string;
  'customer_email'?: string;
  'customer_update'?: {
    'address'?: string;
    'name'?: string;
    'shipping'?: string;
  };
  'discounts'?: {
    'coupon'?: string;
    'promotion_code'?: string;
  }[];
  'excluded_payment_method_types'?: string[];
  'expand'?: string[];
  'expires_at'?: number;
  'integration_identifier'?: string;
  'invoice_creation'?: {
    'enabled': boolean;
    'invoice_data'?: {
      'account_tax_ids'?: Record<string, any>;
      'custom_fields'?: Record<string, any>;
      'description'?: string;
      'footer'?: string;
      'issuer'?: {
        'account'?: string;
        'type': string;
      };
      'metadata'?: Record<string, any>;
      'rendering_options'?: Record<string, any>;
    };
  };
  'line_items'?: {
    'adjustable_quantity'?: {
      'enabled': boolean;
      'maximum'?: number;
      'minimum'?: number;
    };
    'metadata'?: Record<string, any>;
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product'?: string;
      'product_data'?: {
        'description'?: string;
        'images'?: string[];
        'metadata'?: Record<string, any>;
        'name': string;
        'tax_code'?: string;
        'unit_label'?: string;
      };
      'recurring'?: {
        'interval': string;
        'interval_count'?: number;
      };
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: string[];
  }[];
  'locale'?: string;
  'managed_payments'?: {
    'enabled'?: boolean;
  };
  'metadata'?: Record<string, any>;
  'mode'?: string;
  'name_collection'?: {
    'business'?: {
      'enabled': boolean;
      'optional'?: boolean;
    };
    'individual'?: {
      'enabled': boolean;
      'optional'?: boolean;
    };
  };
  'optional_items'?: {
    'adjustable_quantity'?: {
      'enabled': boolean;
      'maximum'?: number;
      'minimum'?: number;
    };
    'price': string;
    'quantity': number;
  }[];
  'origin_context'?: string;
  'payment_intent_data'?: {
    'application_fee_amount'?: number;
    'capture_method'?: string;
    'description'?: string;
    'metadata'?: Record<string, any>;
    'on_behalf_of'?: string;
    'receipt_email'?: string;
    'setup_future_usage'?: string;
    'shipping'?: {
      'address': {
        'city'?: string;
        'country'?: string;
        'line1': string;
        'line2'?: string;
        'postal_code'?: string;
        'state'?: string;
      };
      'carrier'?: string;
      'name': string;
      'phone'?: string;
      'tracking_number'?: string;
    };
    'statement_descriptor'?: string;
    'statement_descriptor_suffix'?: string;
    'transfer_data'?: {
      'amount'?: number;
      'destination': string;
    };
    'transfer_group'?: string;
  };
  'payment_method_collection'?: string;
  'payment_method_configuration'?: string;
  'payment_method_data'?: {
    'allow_redisplay'?: string;
  };
  'payment_method_options'?: {
    'acss_debit'?: {
      'currency'?: string;
      'mandate_options'?: {
        'custom_mandate_url'?: Record<string, any>;
        'default_for'?: string[];
        'interval_description'?: string;
        'payment_schedule'?: string;
        'transaction_type'?: string;
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
      'verification_method'?: string;
    };
    'affirm'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'afterpay_clearpay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'alipay'?: {
      'setup_future_usage'?: string;
    };
    'alma'?: {
      'capture_method'?: string;
    };
    'amazon_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'au_becs_debit'?: {
      'setup_future_usage'?: string;
      'target_date'?: string;
    };
    'bacs_debit'?: {
      'mandate_options'?: {
        'reference_prefix'?: Record<string, any>;
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
    };
    'bancontact'?: {
      'setup_future_usage'?: string;
    };
    'billie'?: {
      'capture_method'?: string;
    };
    'boleto'?: {
      'expires_after_days'?: number;
      'setup_future_usage'?: string;
    };
    'card'?: {
      'capture_method'?: string;
      'installments'?: {
        'enabled'?: boolean;
      };
      'request_extended_authorization'?: string;
      'request_incremental_authorization'?: string;
      'request_multicapture'?: string;
      'request_overcapture'?: string;
      'request_three_d_secure'?: string;
      'restrictions'?: {
        'brands_blocked'?: string[];
      };
      'setup_future_usage'?: string;
      'statement_descriptor_suffix_kana'?: string;
      'statement_descriptor_suffix_kanji'?: string;
    };
    'cashapp'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'crypto'?: {
      'setup_future_usage'?: string;
    };
    'customer_balance'?: {
      'bank_transfer'?: {
        'eu_bank_transfer'?: {
          'country': string;
        };
        'requested_address_types'?: string[];
        'type': string;
      };
      'funding_type'?: string;
      'setup_future_usage'?: string;
    };
    'demo_pay'?: {
      'setup_future_usage'?: string;
    };
    'eps'?: {
      'setup_future_usage'?: string;
    };
    'fpx'?: {
      'setup_future_usage'?: string;
    };
    'giropay'?: {
      'setup_future_usage'?: string;
    };
    'grabpay'?: {
      'setup_future_usage'?: string;
    };
    'ideal'?: {
      'setup_future_usage'?: string;
    };
    'kakao_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'klarna'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
      'subscriptions'?: Record<string, any>;
    };
    'konbini'?: {
      'expires_after_days'?: number;
      'setup_future_usage'?: string;
    };
    'kr_card'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'link'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'mobilepay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'multibanco'?: {
      'setup_future_usage'?: string;
    };
    'naver_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'oxxo'?: {
      'expires_after_days'?: number;
      'setup_future_usage'?: string;
    };
    'p24'?: {
      'setup_future_usage'?: string;
      'tos_shown_and_accepted'?: boolean;
    };
    'pay_by_bank'?: Record<string, any>;
    'payco'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'paynow'?: {
      'setup_future_usage'?: string;
    };
    'paypal'?: {
      'capture_method'?: string;
      'preferred_locale'?: string;
      'reference'?: string;
      'risk_correlation_id'?: string;
      'setup_future_usage'?: string;
    };
    'payto'?: {
      'mandate_options'?: {
        'amount'?: Record<string, any>;
        'amount_type'?: string;
        'end_date'?: Record<string, any>;
        'payment_schedule'?: string;
        'payments_per_period'?: Record<string, any>;
        'purpose'?: string;
        'start_date'?: Record<string, any>;
      };
      'setup_future_usage'?: string;
    };
    'pix'?: {
      'amount_includes_iof'?: string;
      'expires_after_seconds'?: number;
      'mandate_options'?: {
        'amount'?: number;
        'amount_includes_iof'?: string;
        'amount_type'?: string;
        'currency'?: string;
        'end_date'?: string;
        'payment_schedule'?: string;
        'reference'?: string;
        'start_date'?: string;
      };
      'setup_future_usage'?: string;
    };
    'revolut_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'samsung_pay'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'satispay'?: {
      'capture_method'?: string;
    };
    'scalapay'?: {
      'capture_method'?: string;
    };
    'sepa_debit'?: {
      'mandate_options'?: {
        'reference_prefix'?: Record<string, any>;
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
    };
    'sofort'?: {
      'setup_future_usage'?: string;
    };
    'sunbit'?: {
      'capture_method'?: string;
      'setup_future_usage'?: string;
    };
    'swish'?: {
      'reference'?: string;
    };
    'twint'?: {
      'setup_future_usage'?: string;
    };
    'upi'?: {
      'mandate_options'?: {
        'amount'?: number;
        'amount_type'?: string;
        'description'?: string;
        'end_date'?: number;
      };
      'setup_future_usage'?: string;
    };
    'us_bank_account'?: {
      'financial_connections'?: {
        'permissions'?: string[];
        'prefetch'?: string[];
      };
      'setup_future_usage'?: string;
      'target_date'?: string;
      'verification_method'?: string;
    };
    'wechat_pay'?: {
      'app_id'?: string;
      'client': string;
      'setup_future_usage'?: string;
    };
  };
  'payment_method_types'?: string[];
  'permissions'?: {
    'update_shipping_details'?: string;
  };
  'phone_number_collection'?: {
    'enabled': boolean;
  };
  'redirect_on_completion'?: string;
  'return_url'?: string;
  'saved_payment_method_options'?: {
    'allow_redisplay_filters'?: string[];
    'payment_method_remove'?: string;
    'payment_method_save'?: string;
  };
  'setup_intent_data'?: {
    'description'?: string;
    'metadata'?: Record<string, any>;
    'on_behalf_of'?: string;
  };
  'shipping_address_collection'?: {
    'allowed_countries': string[];
  };
  'shipping_options'?: {
    'shipping_rate'?: string;
    'shipping_rate_data'?: {
      'delivery_estimate'?: {
        'maximum'?: {
          'unit': string;
          'value': number;
        };
        'minimum'?: {
          'unit': string;
          'value': number;
        };
      };
      'display_name': string;
      'fixed_amount'?: {
        'amount': number;
        'currency': string;
        'currency_options'?: Record<string, any>;
      };
      'metadata'?: Record<string, any>;
      'tax_behavior'?: string;
      'tax_code'?: string;
      'type'?: string;
    };
  }[];
  'submit_type'?: string;
  'subscription_data'?: {
    'application_fee_percent'?: number;
    'billing_cycle_anchor'?: number;
    'billing_cycle_anchor_config'?: {
      'day_of_month': number;
      'hour'?: number;
      'minute'?: number;
      'month'?: number;
      'second'?: number;
    };
    'billing_mode'?: {
      'flexible'?: {
        'proration_discounts'?: string;
      };
      'type': string;
    };
    'default_tax_rates'?: string[];
    'description'?: string;
    'invoice_settings'?: {
      'issuer'?: {
        'account'?: string;
        'type': string;
      };
    };
    'metadata'?: Record<string, any>;
    'on_behalf_of'?: string;
    'pending_invoice_item_interval'?: {
      'interval': string;
      'interval_count'?: number;
    };
    'proration_behavior'?: string;
    'transfer_data'?: {
      'amount_percent'?: number;
      'destination': string;
    };
    'trial_end'?: number;
    'trial_period_days'?: number;
    'trial_settings'?: {
      'end_behavior': {
        'missing_payment_method': string;
      };
    };
  };
  'success_url'?: string;
  'tax_id_collection'?: {
    'enabled': boolean;
    'required'?: string;
  };
  'ui_mode'?: string;
  'wallet_options'?: {
    'link'?: {
      'display'?: string;
    };
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostCheckoutSessionsResponse

Source: src/Stripe.ts

```typescript
export type PostCheckoutSessionsResponse =
  | { ok: true; status: number; data: PostCheckoutSessionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostCheckoutSessionsErrorResult };
```

### PostCheckoutSessionsSuccessResult

Source: src/Stripe.ts

```typescript
export type PostCheckoutSessionsSuccessResult = CheckoutSession;
```

### PostCustomersCustomerErrorResult

Source: src/Stripe.ts

```typescript
export type PostCustomersCustomerErrorResult = Error;
```

### PostCustomersCustomerOptions

Source: src/Stripe.ts

```typescript
export interface PostCustomersCustomerOptions {
  'customer': string;
  'address'?: Record<string, any>;
  'balance'?: number;
  'bank_account'?: Record<string, any>;
  'business_name'?: Record<string, any>;
  'card'?: Record<string, any>;
  'cash_balance'?: {
    'settings'?: {
      'reconciliation_mode'?: string;
    };
  };
  'default_alipay_account'?: string;
  'default_bank_account'?: string;
  'default_card'?: string;
  'default_source'?: string;
  'description'?: string;
  'email'?: string;
  'expand'?: string[];
  'individual_name'?: Record<string, any>;
  'invoice_prefix'?: string;
  'invoice_settings'?: {
    'custom_fields'?: Record<string, any>;
    'default_payment_method'?: string;
    'footer'?: string;
    'rendering_options'?: Record<string, any>;
  };
  'metadata'?: Record<string, any>;
  'name'?: string;
  'next_invoice_sequence'?: number;
  'phone'?: string;
  'preferred_locales'?: string[];
  'shipping'?: Record<string, any>;
  'source'?: string;
  'tax'?: {
    'ip_address'?: Record<string, any>;
    'validate_location'?: string;
  };
  'tax_exempt'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostCustomersCustomerResponse

Source: src/Stripe.ts

```typescript
export type PostCustomersCustomerResponse =
  | { ok: true; status: number; data: PostCustomersCustomerSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostCustomersCustomerErrorResult };
```

### PostCustomersCustomerSuccessResult

Source: src/Stripe.ts

```typescript
export type PostCustomersCustomerSuccessResult = Customer;
```

### PostCustomersErrorResult

Source: src/Stripe.ts

```typescript
export type PostCustomersErrorResult = Error;
```

### PostCustomersOptions

Source: src/Stripe.ts

```typescript
export interface PostCustomersOptions {
  'address'?: Record<string, any>;
  'balance'?: number;
  'business_name'?: Record<string, any>;
  'cash_balance'?: {
    'settings'?: {
      'reconciliation_mode'?: string;
    };
  };
  'description'?: string;
  'email'?: string;
  'expand'?: string[];
  'individual_name'?: Record<string, any>;
  'invoice_prefix'?: string;
  'invoice_settings'?: {
    'custom_fields'?: Record<string, any>;
    'default_payment_method'?: string;
    'footer'?: string;
    'rendering_options'?: Record<string, any>;
  };
  'metadata'?: Record<string, any>;
  'name'?: string;
  'next_invoice_sequence'?: number;
  'payment_method'?: string;
  'phone'?: string;
  'preferred_locales'?: string[];
  'shipping'?: Record<string, any>;
  'source'?: string;
  'tax'?: {
    'ip_address'?: Record<string, any>;
    'validate_location'?: string;
  };
  'tax_exempt'?: string;
  'tax_id_data'?: {
    'type': string;
    'value': string;
  }[];
  'test_clock'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostCustomersResponse

Source: src/Stripe.ts

```typescript
export type PostCustomersResponse =
  | { ok: true; status: number; data: PostCustomersSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostCustomersErrorResult };
```

### PostCustomersSuccessResult

Source: src/Stripe.ts

```typescript
export type PostCustomersSuccessResult = Customer;
```

### PostInvoicesCreatePreviewErrorResult

Source: src/Stripe.ts

```typescript
export type PostInvoicesCreatePreviewErrorResult = Error;
```

### PostInvoicesCreatePreviewOptions

Source: src/Stripe.ts

```typescript
export interface PostInvoicesCreatePreviewOptions {
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'currency'?: string;
  'customer'?: string;
  'customer_account'?: string;
  'customer_details'?: {
    'address'?: Record<string, any>;
    'shipping'?: Record<string, any>;
    'tax'?: {
      'ip_address'?: Record<string, any>;
    };
    'tax_exempt'?: string;
    'tax_ids'?: {
      'type': string;
      'value': string;
    }[];
  };
  'discounts'?: Record<string, any>;
  'expand'?: string[];
  'invoice_items'?: {
    'amount'?: number;
    'currency'?: string;
    'description'?: string;
    'discountable'?: boolean;
    'discounts'?: Record<string, any>;
    'invoiceitem'?: string;
    'metadata'?: Record<string, any>;
    'period'?: {
      'end': number;
      'start': number;
    };
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'quantity_decimal'?: string;
    'tax_behavior'?: string;
    'tax_code'?: Record<string, any>;
    'tax_rates'?: Record<string, any>;
    'unit_amount'?: number;
    'unit_amount_decimal'?: string;
  }[];
  'issuer'?: {
    'account'?: string;
    'type': string;
  };
  'on_behalf_of'?: Record<string, any>;
  'preview_mode'?: string;
  'schedule'?: string;
  'schedule_details'?: {
    'billing_mode'?: {
      'flexible'?: {
        'proration_discounts'?: string;
      };
      'type': string;
    };
    'end_behavior'?: string;
    'phases'?: {
      'add_invoice_items'?: {
        'discountable'?: boolean;
        'discounts'?: {
          'coupon'?: string;
          'discount'?: string;
          'promotion_code'?: string;
        }[];
        'metadata'?: Record<string, any>;
        'period'?: {
          'end': {
            'timestamp'?: number;
            'type': string;
          };
          'start': {
            'timestamp'?: number;
            'type': string;
          };
        };
        'price'?: string;
        'price_data'?: {
          'currency': string;
          'product': string;
          'tax_behavior'?: string;
          'unit_amount'?: number;
          'unit_amount_decimal'?: string;
        };
        'quantity'?: number;
        'tax_rates'?: Record<string, any>;
      }[];
      'application_fee_percent'?: number;
      'automatic_tax'?: {
        'enabled': boolean;
        'liability'?: {
          'account'?: string;
          'type': string;
        };
      };
      'billing_cycle_anchor'?: string;
      'billing_thresholds'?: Record<string, any>;
      'collection_method'?: string;
      'default_payment_method'?: string;
      'default_tax_rates'?: Record<string, any>;
      'description'?: Record<string, any>;
      'discounts'?: Record<string, any>;
      'duration'?: {
        'interval': string;
        'interval_count'?: number;
      };
      'end_date'?: Record<string, any>;
      'invoice_settings'?: {
        'account_tax_ids'?: Record<string, any>;
        'days_until_due'?: number;
        'issuer'?: {
          'account'?: string;
          'type': string;
        };
      };
      'items': {
        'billing_thresholds'?: Record<string, any>;
        'discounts'?: Record<string, any>;
        'metadata'?: Record<string, any>;
        'price'?: string;
        'price_data'?: {
          'currency': string;
          'product': string;
          'recurring': {
            'interval': string;
            'interval_count'?: number;
          };
          'tax_behavior'?: string;
          'unit_amount'?: number;
          'unit_amount_decimal'?: string;
        };
        'quantity'?: number;
        'tax_rates'?: Record<string, any>;
      }[];
      'metadata'?: Record<string, any>;
      'on_behalf_of'?: string;
      'proration_behavior'?: string;
      'start_date'?: Record<string, any>;
      'transfer_data'?: {
        'amount_percent'?: number;
        'destination': string;
      };
      'trial'?: boolean;
      'trial_end'?: Record<string, any>;
    }[];
    'proration_behavior'?: string;
  };
  'subscription'?: string;
  'subscription_details'?: {
    'billing_cycle_anchor'?: Record<string, any>;
    'billing_mode'?: {
      'flexible'?: {
        'proration_discounts'?: string;
      };
      'type': string;
    };
    'billing_schedules'?: Record<string, any>;
    'cancel_at'?: Record<string, any>;
    'cancel_at_period_end'?: boolean;
    'cancel_now'?: boolean;
    'default_tax_rates'?: Record<string, any>;
    'items'?: {
      'billing_thresholds'?: Record<string, any>;
      'clear_usage'?: boolean;
      'deleted'?: boolean;
      'discounts'?: Record<string, any>;
      'id'?: string;
      'metadata'?: Record<string, any>;
      'price'?: string;
      'price_data'?: {
        'currency': string;
        'product': string;
        'recurring': {
          'interval': string;
          'interval_count'?: number;
        };
        'tax_behavior'?: string;
        'unit_amount'?: number;
        'unit_amount_decimal'?: string;
      };
      'quantity'?: number;
      'tax_rates'?: Record<string, any>;
    }[];
    'metadata'?: Record<string, any>;
    'proration_behavior'?: string;
    'proration_date'?: number;
    'resume_at'?: string;
    'start_date'?: number;
    'trial_end'?: Record<string, any>;
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostInvoicesCreatePreviewResponse

Source: src/Stripe.ts

```typescript
export type PostInvoicesCreatePreviewResponse =
  | { ok: true; status: number; data: PostInvoicesCreatePreviewSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostInvoicesCreatePreviewErrorResult };
```

### PostInvoicesCreatePreviewSuccessResult

Source: src/Stripe.ts

```typescript
export type PostInvoicesCreatePreviewSuccessResult = Invoice;
```

### PostInvoicesErrorResult

Source: src/Stripe.ts

```typescript
export type PostInvoicesErrorResult = Error;
```

### PostInvoicesInvoiceErrorResult

Source: src/Stripe.ts

```typescript
export type PostInvoicesInvoiceErrorResult = Error;
```

### PostInvoicesInvoiceOptions

Source: src/Stripe.ts

```typescript
export interface PostInvoicesInvoiceOptions {
  'invoice': string;
  'account_tax_ids'?: Record<string, any>;
  'application_fee_amount'?: number;
  'auto_advance'?: boolean;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'automatically_finalizes_at'?: number;
  'collection_method'?: string;
  'custom_fields'?: Record<string, any>;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: Record<string, any>;
  'default_tax_rates'?: Record<string, any>;
  'description'?: string;
  'discounts'?: Record<string, any>;
  'due_date'?: number;
  'effective_at'?: Record<string, any>;
  'expand'?: string[];
  'footer'?: string;
  'issuer'?: {
    'account'?: string;
    'type': string;
  };
  'metadata'?: Record<string, any>;
  'number'?: Record<string, any>;
  'on_behalf_of'?: Record<string, any>;
  'payment_settings'?: {
    'default_mandate'?: Record<string, any>;
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
  };
  'rendering'?: {
    'amount_tax_display'?: string;
    'pdf'?: {
      'page_size'?: string;
    };
    'template'?: string;
    'template_version'?: Record<string, any>;
  };
  'shipping_cost'?: Record<string, any>;
  'shipping_details'?: Record<string, any>;
  'statement_descriptor'?: string;
  'transfer_data'?: Record<string, any>;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostInvoicesInvoiceResponse

Source: src/Stripe.ts

```typescript
export type PostInvoicesInvoiceResponse =
  | { ok: true; status: number; data: PostInvoicesInvoiceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostInvoicesInvoiceErrorResult };
```

### PostInvoicesInvoiceSuccessResult

Source: src/Stripe.ts

```typescript
export type PostInvoicesInvoiceSuccessResult = Invoice;
```

### PostInvoicesOptions

Source: src/Stripe.ts

```typescript
export interface PostInvoicesOptions {
  'account_tax_ids'?: Record<string, any>;
  'application_fee_amount'?: number;
  'auto_advance'?: boolean;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'automatically_finalizes_at'?: number;
  'collection_method'?: string;
  'currency'?: string;
  'custom_fields'?: Record<string, any>;
  'customer'?: string;
  'customer_account'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: string;
  'default_tax_rates'?: string[];
  'description'?: string;
  'discounts'?: Record<string, any>;
  'due_date'?: number;
  'effective_at'?: number;
  'expand'?: string[];
  'footer'?: string;
  'from_invoice'?: {
    'action': string;
    'invoice': string;
  };
  'issuer'?: {
    'account'?: string;
    'type': string;
  };
  'metadata'?: Record<string, any>;
  'number'?: string;
  'on_behalf_of'?: string;
  'payment_settings'?: {
    'default_mandate'?: Record<string, any>;
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
  };
  'pending_invoice_items_behavior'?: string;
  'rendering'?: {
    'amount_tax_display'?: string;
    'pdf'?: {
      'page_size'?: string;
    };
    'template'?: string;
    'template_version'?: Record<string, any>;
  };
  'shipping_cost'?: {
    'shipping_rate'?: string;
    'shipping_rate_data'?: {
      'delivery_estimate'?: {
        'maximum'?: {
          'unit': string;
          'value': number;
        };
        'minimum'?: {
          'unit': string;
          'value': number;
        };
      };
      'display_name': string;
      'fixed_amount'?: {
        'amount': number;
        'currency': string;
        'currency_options'?: Record<string, any>;
      };
      'metadata'?: Record<string, any>;
      'tax_behavior'?: string;
      'tax_code'?: string;
      'type'?: string;
    };
  };
  'shipping_details'?: {
    'address': {
      'city'?: string;
      'country'?: string;
      'line1'?: string;
      'line2'?: string;
      'postal_code'?: string;
      'state'?: string;
    };
    'name': string;
    'phone'?: Record<string, any>;
  };
  'statement_descriptor'?: string;
  'subscription'?: string;
  'transfer_data'?: {
    'amount'?: number;
    'destination': string;
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostInvoicesResponse

Source: src/Stripe.ts

```typescript
export type PostInvoicesResponse =
  | { ok: true; status: number; data: PostInvoicesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostInvoicesErrorResult };
```

### PostInvoicesSuccessResult

Source: src/Stripe.ts

```typescript
export type PostInvoicesSuccessResult = Invoice;
```

### PostPricesErrorResult

Source: src/Stripe.ts

```typescript
export type PostPricesErrorResult = Error;
```

### PostPricesOptions

Source: src/Stripe.ts

```typescript
export interface PostPricesOptions {
  'active'?: boolean;
  'billing_scheme'?: string;
  'currency': string;
  'currency_options'?: Record<string, any>;
  'custom_unit_amount'?: {
    'enabled': boolean;
    'maximum'?: number;
    'minimum'?: number;
    'preset'?: number;
  };
  'expand'?: string[];
  'lookup_key'?: string;
  'metadata'?: Record<string, any>;
  'nickname'?: string;
  'product'?: string;
  'product_data'?: {
    'active'?: boolean;
    'id'?: string;
    'metadata'?: Record<string, any>;
    'name': string;
    'statement_descriptor'?: string;
    'tax_code'?: string;
    'unit_label'?: string;
  };
  'recurring'?: {
    'interval': string;
    'interval_count'?: number;
    'meter'?: string;
    'usage_type'?: string;
  };
  'tax_behavior'?: string;
  'tiers'?: {
    'flat_amount'?: number;
    'flat_amount_decimal'?: string;
    'unit_amount'?: number;
    'unit_amount_decimal'?: string;
    'up_to': Record<string, any>;
  }[];
  'tiers_mode'?: string;
  'transfer_lookup_key'?: boolean;
  'transform_quantity'?: {
    'divide_by': number;
    'round': string;
  };
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostPricesPriceErrorResult

Source: src/Stripe.ts

```typescript
export type PostPricesPriceErrorResult = Error;
```

### PostPricesPriceOptions

Source: src/Stripe.ts

```typescript
export interface PostPricesPriceOptions {
  'price': string;
  'active'?: boolean;
  'currency_options'?: Record<string, any>;
  'expand'?: string[];
  'lookup_key'?: string;
  'metadata'?: Record<string, any>;
  'nickname'?: string;
  'tax_behavior'?: string;
  'transfer_lookup_key'?: boolean;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostPricesPriceResponse

Source: src/Stripe.ts

```typescript
export type PostPricesPriceResponse =
  | { ok: true; status: number; data: PostPricesPriceSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostPricesPriceErrorResult };
```

### PostPricesPriceSuccessResult

Source: src/Stripe.ts

```typescript
export type PostPricesPriceSuccessResult = Price;
```

### PostPricesResponse

Source: src/Stripe.ts

```typescript
export type PostPricesResponse =
  | { ok: true; status: number; data: PostPricesSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostPricesErrorResult };
```

### PostPricesSuccessResult

Source: src/Stripe.ts

```typescript
export type PostPricesSuccessResult = Price;
```

### PostProductsErrorResult

Source: src/Stripe.ts

```typescript
export type PostProductsErrorResult = Error;
```

### PostProductsIdErrorResult

Source: src/Stripe.ts

```typescript
export type PostProductsIdErrorResult = Error;
```

### PostProductsIdOptions

Source: src/Stripe.ts

```typescript
export interface PostProductsIdOptions {
  'id': string;
  'active'?: boolean;
  'default_price'?: string;
  'description'?: Record<string, any>;
  'expand'?: string[];
  'images'?: Record<string, any>;
  'marketing_features'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'name'?: string;
  'package_dimensions'?: Record<string, any>;
  'shippable'?: boolean;
  'statement_descriptor'?: string;
  'tax_code'?: Record<string, any>;
  'unit_label'?: Record<string, any>;
  'url'?: Record<string, any>;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostProductsIdResponse

Source: src/Stripe.ts

```typescript
export type PostProductsIdResponse =
  | { ok: true; status: number; data: PostProductsIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostProductsIdErrorResult };
```

### PostProductsIdSuccessResult

Source: src/Stripe.ts

```typescript
export type PostProductsIdSuccessResult = Product;
```

### PostProductsOptions

Source: src/Stripe.ts

```typescript
export interface PostProductsOptions {
  'active'?: boolean;
  'default_price_data'?: {
    'currency': string;
    'currency_options'?: Record<string, any>;
    'custom_unit_amount'?: {
      'enabled': boolean;
      'maximum'?: number;
      'minimum'?: number;
      'preset'?: number;
    };
    'metadata'?: Record<string, any>;
    'recurring'?: {
      'interval': string;
      'interval_count'?: number;
    };
    'tax_behavior'?: string;
    'unit_amount'?: number;
    'unit_amount_decimal'?: string;
  };
  'description'?: string;
  'expand'?: string[];
  'id'?: string;
  'images'?: string[];
  'marketing_features'?: {
    'name': string;
  }[];
  'metadata'?: Record<string, any>;
  'name': string;
  'package_dimensions'?: {
    'height': number;
    'length': number;
    'weight': number;
    'width': number;
  };
  'shippable'?: boolean;
  'statement_descriptor'?: string;
  'tax_code'?: string;
  'unit_label'?: string;
  'url'?: string;
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostProductsResponse

Source: src/Stripe.ts

```typescript
export type PostProductsResponse =
  | { ok: true; status: number; data: PostProductsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostProductsErrorResult };
```

### PostProductsSuccessResult

Source: src/Stripe.ts

```typescript
export type PostProductsSuccessResult = Product;
```

### PostSubscriptionsErrorResult

Source: src/Stripe.ts

```typescript
export type PostSubscriptionsErrorResult = Error;
```

### PostSubscriptionsOptions

Source: src/Stripe.ts

```typescript
export interface PostSubscriptionsOptions {
  'add_invoice_items'?: {
    'discountable'?: boolean;
    'discounts'?: {
      'coupon'?: string;
      'discount'?: string;
      'promotion_code'?: string;
    }[];
    'metadata'?: Record<string, any>;
    'period'?: {
      'end': {
        'timestamp'?: number;
        'type': string;
      };
      'start': {
        'timestamp'?: number;
        'type': string;
      };
    };
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'application_fee_percent'?: Record<string, any>;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'backdate_start_date'?: number;
  'billing_cycle_anchor'?: number;
  'billing_cycle_anchor_config'?: {
    'day_of_month': number;
    'hour'?: number;
    'minute'?: number;
    'month'?: number;
    'second'?: number;
  };
  'billing_mode'?: {
    'flexible'?: {
      'proration_discounts'?: string;
    };
    'type': string;
  };
  'billing_schedules'?: {
    'applies_to'?: {
      'price'?: string;
      'type': string;
    }[];
    'bill_until': {
      'duration'?: {
        'interval': string;
        'interval_count'?: number;
      };
      'timestamp'?: number;
      'type': string;
    };
    'key'?: string;
  }[];
  'billing_thresholds'?: Record<string, any>;
  'cancel_at'?: Record<string, any>;
  'cancel_at_period_end'?: boolean;
  'collection_method'?: string;
  'currency'?: string;
  'customer'?: string;
  'customer_account'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: string;
  'default_tax_rates'?: Record<string, any>;
  'description'?: string;
  'discounts'?: Record<string, any>;
  'expand'?: string[];
  'invoice_settings'?: {
    'account_tax_ids'?: Record<string, any>;
    'custom_fields'?: Record<string, any>;
    'description'?: string;
    'footer'?: string;
    'issuer'?: {
      'account'?: string;
      'type': string;
    };
  };
  'items'?: {
    'billing_thresholds'?: Record<string, any>;
    'discounts'?: Record<string, any>;
    'metadata'?: Record<string, any>;
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'recurring': {
        'interval': string;
        'interval_count'?: number;
      };
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'metadata'?: Record<string, any>;
  'off_session'?: boolean;
  'on_behalf_of'?: Record<string, any>;
  'payment_behavior'?: string;
  'payment_settings'?: {
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
    'save_default_payment_method'?: string;
  };
  'pending_invoice_item_interval'?: Record<string, any>;
  'proration_behavior'?: string;
  'transfer_data'?: {
    'amount_percent'?: number;
    'destination': string;
  };
  'trial_end'?: Record<string, any>;
  'trial_from_plan'?: boolean;
  'trial_period_days'?: number;
  'trial_settings'?: {
    'end_behavior': {
      'missing_payment_method': string;
    };
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostSubscriptionsResponse

Source: src/Stripe.ts

```typescript
export type PostSubscriptionsResponse =
  | { ok: true; status: number; data: PostSubscriptionsSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostSubscriptionsErrorResult };
```

### PostSubscriptionsSubscriptionExposedIdErrorResult

Source: src/Stripe.ts

```typescript
export type PostSubscriptionsSubscriptionExposedIdErrorResult = Error;
```

### PostSubscriptionsSubscriptionExposedIdOptions

Source: src/Stripe.ts

```typescript
export interface PostSubscriptionsSubscriptionExposedIdOptions {
  'subscription_exposed_id': string;
  'add_invoice_items'?: {
    'discountable'?: boolean;
    'discounts'?: {
      'coupon'?: string;
      'discount'?: string;
      'promotion_code'?: string;
    }[];
    'metadata'?: Record<string, any>;
    'period'?: {
      'end': {
        'timestamp'?: number;
        'type': string;
      };
      'start': {
        'timestamp'?: number;
        'type': string;
      };
    };
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'application_fee_percent'?: Record<string, any>;
  'automatic_tax'?: {
    'enabled': boolean;
    'liability'?: {
      'account'?: string;
      'type': string;
    };
  };
  'billing_cycle_anchor'?: string;
  'billing_schedules'?: Record<string, any>;
  'billing_thresholds'?: Record<string, any>;
  'cancel_at'?: Record<string, any>;
  'cancel_at_period_end'?: boolean;
  'cancellation_details'?: {
    'comment'?: Record<string, any>;
    'feedback'?: string;
  };
  'collection_method'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: string;
  'default_source'?: Record<string, any>;
  'default_tax_rates'?: Record<string, any>;
  'description'?: Record<string, any>;
  'discounts'?: Record<string, any>;
  'expand'?: string[];
  'invoice_settings'?: {
    'account_tax_ids'?: Record<string, any>;
    'custom_fields'?: Record<string, any>;
    'description'?: Record<string, any>;
    'footer'?: Record<string, any>;
    'issuer'?: {
      'account'?: string;
      'type': string;
    };
  };
  'items'?: {
    'billing_thresholds'?: Record<string, any>;
    'clear_usage'?: boolean;
    'deleted'?: boolean;
    'discounts'?: Record<string, any>;
    'id'?: string;
    'metadata'?: Record<string, any>;
    'price'?: string;
    'price_data'?: {
      'currency': string;
      'product': string;
      'recurring': {
        'interval': string;
        'interval_count'?: number;
      };
      'tax_behavior'?: string;
      'unit_amount'?: number;
      'unit_amount_decimal'?: string;
    };
    'quantity'?: number;
    'tax_rates'?: Record<string, any>;
  }[];
  'metadata'?: Record<string, any>;
  'off_session'?: boolean;
  'on_behalf_of'?: Record<string, any>;
  'pause_collection'?: Record<string, any>;
  'payment_behavior'?: string;
  'payment_settings'?: {
    'payment_method_options'?: {
      'acss_debit'?: Record<string, any>;
      'bancontact'?: Record<string, any>;
      'card'?: Record<string, any>;
      'customer_balance'?: Record<string, any>;
      'konbini'?: Record<string, any>;
      'payto'?: Record<string, any>;
      'pix'?: Record<string, any>;
      'sepa_debit'?: Record<string, any>;
      'upi'?: Record<string, any>;
      'us_bank_account'?: Record<string, any>;
    };
    'payment_method_types'?: Record<string, any>;
    'save_default_payment_method'?: string;
  };
  'pending_invoice_item_interval'?: Record<string, any>;
  'proration_behavior'?: string;
  'proration_date'?: number;
  'transfer_data'?: Record<string, any>;
  'trial_end'?: Record<string, any>;
  'trial_from_plan'?: boolean;
  'trial_settings'?: {
    'end_behavior': {
      'missing_payment_method': string;
    };
  };
  headers?: Record<string, string>;
  _credentials?: Record<string, string>;
  fused?: FusedExecutionOptions;
}
```

### PostSubscriptionsSubscriptionExposedIdResponse

Source: src/Stripe.ts

```typescript
export type PostSubscriptionsSubscriptionExposedIdResponse =
  | { ok: true; status: number; data: PostSubscriptionsSubscriptionExposedIdSuccessResult; error: null }
  | { ok: false; status: number; data: null; error: PostSubscriptionsSubscriptionExposedIdErrorResult };
```

### PostSubscriptionsSubscriptionExposedIdSuccessResult

Source: src/Stripe.ts

```typescript
export type PostSubscriptionsSubscriptionExposedIdSuccessResult = Subscription;
```

### PostSubscriptionsSuccessResult

Source: src/Stripe.ts

```typescript
export type PostSubscriptionsSuccessResult = Subscription;
```

### StripeIntegrationConfig

Source: src/Stripe.ts

```typescript
export interface StripeIntegrationConfig extends SDKConfig {
  environment?: string;
}
```

### ApiErrors

Source: src/types/Stripe.ts

```typescript
export type ApiErrors = {
  'advice_code'?: string;
  'charge'?: string;
  'code'?: string;
  'decline_code'?: string;
  'doc_url'?: string;
  'message'?: string;
  'network_advice_code'?: string;
  'network_decline_code'?: string;
  'param'?: string;
  'payment_intent'?: PaymentIntent;
  'payment_method'?: PaymentMethod;
  'payment_method_type'?: string;
  'request_log_url'?: string;
  'setup_intent'?: SetupIntent;
  'source'?: Record<string, any>;
  'type': string;
};
```

### AutomaticTax

Source: src/types/Stripe.ts

```typescript
export type AutomaticTax = {
  'disabled_reason'?: string;
  'enabled': boolean;
  'liability'?: Record<string, any>;
  'provider'?: string;
  'status'?: string;
};
```

### BillingBillResourceInvoicingTaxesTax

Source: src/types/Stripe.ts

```typescript
export type BillingBillResourceInvoicingTaxesTax = {
  'amount': number;
  'tax_behavior': string;
  'tax_rate_details'?: Record<string, any>;
  'taxability_reason': string;
  'taxable_amount'?: number;
  'type': string;
};
```

### BillingDetails

Source: src/types/Stripe.ts

```typescript
export type BillingDetails = {
  'address'?: Record<string, any>;
  'email'?: string;
  'name'?: string;
  'phone'?: string;
  'tax_id'?: string;
};
```

### CheckoutSession

Source: src/types/Stripe.ts

```typescript
export type CheckoutSession = {
  'adaptive_pricing'?: Record<string, any>;
  'after_expiration'?: Record<string, any>;
  'allow_promotion_codes'?: boolean;
  'amount_subtotal'?: number;
  'amount_total'?: number;
  'automatic_tax': PaymentPagesCheckoutSessionAutomaticTax;
  'billing_address_collection'?: string;
  'branding_settings'?: PaymentPagesCheckoutSessionBrandingSettings;
  'cancel_url'?: string;
  'client_reference_id'?: string;
  'client_secret'?: string;
  'collected_information'?: Record<string, any>;
  'consent'?: Record<string, any>;
  'consent_collection'?: Record<string, any>;
  'created': number;
  'currency'?: string;
  'currency_conversion'?: Record<string, any>;
  'custom_fields': PaymentPagesCheckoutSessionCustomFields[];
  'custom_text': PaymentPagesCheckoutSessionCustomText;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'customer_creation'?: string;
  'customer_details'?: Record<string, any>;
  'customer_email'?: string;
  'discounts'?: PaymentPagesCheckoutSessionDiscount[];
  'excluded_payment_method_types'?: string[];
  'expires_at': number;
  'id': string;
  'integration_identifier'?: string;
  'invoice'?: Record<string, any>;
  'invoice_creation'?: Record<string, any>;
  'line_items'?: {
    'data': Item[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'livemode': boolean;
  'locale'?: string;
  'managed_payments'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'mode': string;
  'name_collection'?: PaymentPagesCheckoutSessionNameCollection;
  'object': string;
  'optional_items'?: PaymentPagesCheckoutSessionOptionalItem[];
  'origin_context'?: string;
  'payment_intent'?: Record<string, any>;
  'payment_link'?: Record<string, any>;
  'payment_method_collection'?: string;
  'payment_method_configuration_details'?: Record<string, any>;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types': string[];
  'payment_status': string;
  'permissions'?: Record<string, any>;
  'phone_number_collection'?: PaymentPagesCheckoutSessionPhoneNumberCollection;
  'presentment_details'?: PaymentFlowsPaymentIntentPresentmentDetails;
  'recovered_from'?: string;
  'redirect_on_completion'?: string;
  'return_url'?: string;
  'saved_payment_method_options'?: Record<string, any>;
  'setup_intent'?: Record<string, any>;
  'shipping_address_collection'?: Record<string, any>;
  'shipping_cost'?: Record<string, any>;
  'shipping_options': PaymentPagesCheckoutSessionShippingOption[];
  'status'?: string;
  'submit_type'?: string;
  'subscription'?: Record<string, any>;
  'success_url'?: string;
  'tax_id_collection'?: PaymentPagesCheckoutSessionTaxIdCollection;
  'total_details'?: Record<string, any>;
  'ui_mode'?: string;
  'url'?: string;
  'wallet_options'?: Record<string, any>;
};
```

### ConnectAccountReference

Source: src/types/Stripe.ts

```typescript
export type ConnectAccountReference = {
  'account'?: Record<string, any>;
  'type': string;
};
```

### Customer

Source: src/types/Stripe.ts

```typescript
export type Customer = {
  'address'?: Record<string, any>;
  'balance'?: number;
  'business_name'?: string;
  'cash_balance'?: Record<string, any>;
  'created': number;
  'currency'?: string;
  'customer_account'?: string;
  'default_source'?: Record<string, any>;
  'delinquent'?: boolean;
  'description'?: string;
  'discount'?: Record<string, any>;
  'email'?: string;
  'id': string;
  'individual_name'?: string;
  'invoice_credit_balance'?: Record<string, any>;
  'invoice_prefix'?: string;
  'invoice_settings'?: InvoiceSettingCustomerSetting;
  'livemode': boolean;
  'metadata'?: Record<string, any>;
  'name'?: string;
  'next_invoice_sequence'?: number;
  'object': string;
  'phone'?: string;
  'preferred_locales'?: string[];
  'shipping'?: Record<string, any>;
  'sources'?: {
    'data': Record<string, any>[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'subscriptions'?: {
    'data': Subscription[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'tax'?: CustomerTax;
  'tax_exempt'?: string;
  'tax_ids'?: {
    'data': TaxId[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'test_clock'?: Record<string, any>;
};
```

### CustomerTax

Source: src/types/Stripe.ts

```typescript
export type CustomerTax = {
  'automatic_tax': string;
  'ip_address'?: string;
  'location'?: Record<string, any>;
  'provider': string;
};
```

### Discount

Source: src/types/Stripe.ts

```typescript
export type Discount = {
  'checkout_session'?: string;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'end'?: number;
  'id': string;
  'invoice'?: string;
  'invoice_item'?: string;
  'object': string;
  'promotion_code'?: Record<string, any>;
  'source': DiscountSource;
  'start': number;
  'subscription'?: string;
  'subscription_item'?: string;
};
```

### DiscountSource

Source: src/types/Stripe.ts

```typescript
export type DiscountSource = {
  'coupon'?: Record<string, any>;
  'type': string;
};
```

### DiscountsResourceDiscountAmount

Source: src/types/Stripe.ts

```typescript
export type DiscountsResourceDiscountAmount = {
  'amount': number;
  'discount': Record<string, any>;
};
```

### Error

Source: src/types/Stripe.ts

```typescript
export type Error = {
  'error': ApiErrors;
};
```

### Invoice

Source: src/types/Stripe.ts

```typescript
export type Invoice = {
  'account_country'?: string;
  'account_name'?: string;
  'account_tax_ids'?: Record<string, any>[];
  'amount_due': number;
  'amount_overpaid': number;
  'amount_paid': number;
  'amount_paid_off_stripe': number;
  'amount_remaining': number;
  'amount_shipping': number;
  'application'?: Record<string, any>;
  'attempt_count': number;
  'attempted': boolean;
  'auto_advance': boolean;
  'automatic_tax': AutomaticTax;
  'automatically_finalizes_at'?: number;
  'billing_reason'?: string;
  'collection_method': string;
  'confirmation_secret'?: Record<string, any>;
  'created': number;
  'currency': string;
  'custom_fields'?: InvoiceSettingCustomField[];
  'customer': Record<string, any>;
  'customer_account'?: string;
  'customer_address'?: Record<string, any>;
  'customer_email'?: string;
  'customer_name'?: string;
  'customer_phone'?: string;
  'customer_shipping'?: Record<string, any>;
  'customer_tax_exempt'?: string;
  'customer_tax_ids'?: InvoicesResourceInvoiceTaxId[];
  'default_payment_method'?: Record<string, any>;
  'default_source'?: Record<string, any>;
  'default_tax_rates': TaxRate[];
  'description'?: string;
  'discounts': Record<string, any>[];
  'due_date'?: number;
  'effective_at'?: number;
  'ending_balance'?: number;
  'footer'?: string;
  'from_invoice'?: Record<string, any>;
  'hosted_invoice_url'?: string;
  'id': string;
  'invoice_pdf'?: string;
  'issuer': ConnectAccountReference;
  'last_finalization_error'?: Record<string, any>;
  'latest_revision'?: Record<string, any>;
  'lines': {
    'data': LineItem[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'livemode': boolean;
  'metadata'?: Record<string, any>;
  'next_payment_attempt'?: number;
  'number'?: string;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'parent'?: Record<string, any>;
  'payment_settings': InvoicesPaymentSettings;
  'payments'?: {
    'data': InvoicePayment[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'period_end': number;
  'period_start': number;
  'post_payment_credit_notes_amount': number;
  'pre_payment_credit_notes_amount': number;
  'receipt_number'?: string;
  'rendering'?: Record<string, any>;
  'shipping_cost'?: Record<string, any>;
  'shipping_details'?: Record<string, any>;
  'starting_balance': number;
  'statement_descriptor'?: string;
  'status'?: string;
  'status_transitions': InvoicesResourceStatusTransitions;
  'subtotal': number;
  'subtotal_excluding_tax'?: number;
  'test_clock'?: Record<string, any>;
  'threshold_reason'?: InvoiceThresholdReason;
  'total': number;
  'total_discount_amounts'?: DiscountsResourceDiscountAmount[];
  'total_excluding_tax'?: number;
  'total_pretax_credit_amounts'?: InvoicesResourcePretaxCreditAmount[];
  'total_taxes'?: BillingBillResourceInvoicingTaxesTax[];
  'webhooks_delivered_at'?: number;
};
```

### InvoiceItemThresholdReason

Source: src/types/Stripe.ts

```typescript
export type InvoiceItemThresholdReason = {
  'line_item_ids': string[];
  'usage_gte': number;
};
```

### InvoiceLineItemPeriod

Source: src/types/Stripe.ts

```typescript
export type InvoiceLineItemPeriod = {
  'end': number;
  'start': number;
};
```

### InvoicePayment

Source: src/types/Stripe.ts

```typescript
export type InvoicePayment = {
  'amount_paid'?: number;
  'amount_requested': number;
  'created': number;
  'currency': string;
  'id': string;
  'invoice': Record<string, any>;
  'is_default': boolean;
  'livemode': boolean;
  'object': string;
  'payment': InvoicesPaymentsInvoicePaymentAssociatedPayment;
  'status': string;
  'status_transitions': InvoicesPaymentsInvoicePaymentStatusTransitions;
};
```

### InvoiceSettingCustomerSetting

Source: src/types/Stripe.ts

```typescript
export type InvoiceSettingCustomerSetting = {
  'custom_fields'?: InvoiceSettingCustomField[];
  'default_payment_method'?: Record<string, any>;
  'footer'?: string;
  'rendering_options'?: Record<string, any>;
};
```

### InvoiceSettingCustomField

Source: src/types/Stripe.ts

```typescript
export type InvoiceSettingCustomField = {
  'name': string;
  'value': string;
};
```

### InvoicesPaymentSettings

Source: src/types/Stripe.ts

```typescript
export type InvoicesPaymentSettings = {
  'default_mandate'?: string;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types'?: string[];
};
```

### InvoicesPaymentsInvoicePaymentAssociatedPayment

Source: src/types/Stripe.ts

```typescript
export type InvoicesPaymentsInvoicePaymentAssociatedPayment = {
  'charge'?: Record<string, any>;
  'payment_intent'?: Record<string, any>;
  'payment_record'?: Record<string, any>;
  'type': string;
};
```

### InvoicesPaymentsInvoicePaymentStatusTransitions

Source: src/types/Stripe.ts

```typescript
export type InvoicesPaymentsInvoicePaymentStatusTransitions = {
  'canceled_at'?: number;
  'paid_at'?: number;
};
```

### InvoicesResourceInvoiceTaxId

Source: src/types/Stripe.ts

```typescript
export type InvoicesResourceInvoiceTaxId = {
  'type': string;
  'value'?: string;
};
```

### InvoicesResourcePretaxCreditAmount

Source: src/types/Stripe.ts

```typescript
export type InvoicesResourcePretaxCreditAmount = {
  'amount': number;
  'credit_balance_transaction'?: Record<string, any>;
  'discount'?: Record<string, any>;
  'type': string;
};
```

### InvoicesResourceStatusTransitions

Source: src/types/Stripe.ts

```typescript
export type InvoicesResourceStatusTransitions = {
  'finalized_at'?: number;
  'marked_uncollectible_at'?: number;
  'paid_at'?: number;
  'voided_at'?: number;
};
```

### InvoiceThresholdReason

Source: src/types/Stripe.ts

```typescript
export type InvoiceThresholdReason = {
  'amount_gte'?: number;
  'item_reasons': InvoiceItemThresholdReason[];
};
```

### Item

Source: src/types/Stripe.ts

```typescript
export type Item = {
  'adjustable_quantity'?: Record<string, any>;
  'amount_discount': number;
  'amount_subtotal': number;
  'amount_tax': number;
  'amount_total': number;
  'currency': string;
  'description'?: string;
  'discounts'?: LineItemsDiscountAmount[];
  'id': string;
  'metadata'?: Record<string, any>;
  'object': string;
  'price'?: Record<string, any>;
  'quantity'?: number;
  'taxes'?: LineItemsTaxAmount[];
};
```

### LineItem

Source: src/types/Stripe.ts

```typescript
export type LineItem = {
  'amount': number;
  'currency': string;
  'description'?: string;
  'discount_amounts'?: DiscountsResourceDiscountAmount[];
  'discountable': boolean;
  'discounts': Record<string, any>[];
  'id': string;
  'invoice'?: string;
  'livemode': boolean;
  'metadata': Record<string, any>;
  'object': string;
  'parent'?: Record<string, any>;
  'period': InvoiceLineItemPeriod;
  'pretax_credit_amounts'?: InvoicesResourcePretaxCreditAmount[];
  'pricing'?: Record<string, any>;
  'quantity'?: number;
  'quantity_decimal'?: string;
  'subscription'?: Record<string, any>;
  'subtotal': number;
  'taxes'?: BillingBillResourceInvoicingTaxesTax[];
};
```

### LineItemsDiscountAmount

Source: src/types/Stripe.ts

```typescript
export type LineItemsDiscountAmount = {
  'amount': number;
  'discount': Discount;
};
```

### LineItemsTaxAmount

Source: src/types/Stripe.ts

```typescript
export type LineItemsTaxAmount = {
  'amount': number;
  'rate': TaxRate;
  'taxability_reason'?: string;
  'taxable_amount'?: number;
};
```

### PaymentFlowsPaymentDetails

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPaymentDetails = {
  'customer_reference'?: string;
  'order_reference'?: string;
};
```

### PaymentFlowsPaymentIntentAsyncWorkflows

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPaymentIntentAsyncWorkflows = {
  'inputs'?: PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputs;
};
```

### PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputs

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputs = {
  'tax'?: PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputsResourceTax;
};
```

### PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputsResourceTax

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPaymentIntentAsyncWorkflowsResourceInputsResourceTax = {
  'calculation': string;
};
```

### PaymentFlowsPaymentIntentPresentmentDetails

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPaymentIntentPresentmentDetails = {
  'presentment_amount': number;
  'presentment_currency': string;
};
```

### PaymentFlowsPrivatePaymentMethodsAlipay

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPrivatePaymentMethodsAlipay = Record<string, any>;
```

### PaymentFlowsPrivatePaymentMethodsCardPresentCommonWallet

Source: src/types/Stripe.ts

```typescript
export type PaymentFlowsPrivatePaymentMethodsCardPresentCommonWallet = {
  'type': string;
};
```

### PaymentIntent

Source: src/types/Stripe.ts

```typescript
export type PaymentIntent = {
  'allowed_payment_method_types'?: string[];
  'amount'?: number;
  'amount_capturable'?: number;
  'amount_details'?: Record<string, any>;
  'amount_received'?: number;
  'application'?: Record<string, any>;
  'application_fee_amount'?: number;
  'automatic_payment_methods'?: Record<string, any>;
  'canceled_at'?: number;
  'cancellation_reason'?: string;
  'capture_method'?: string;
  'client_secret'?: string;
  'confirmation_method'?: string;
  'created': number;
  'currency'?: string;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'description'?: string;
  'excluded_payment_method_types'?: string[];
  'hooks'?: PaymentFlowsPaymentIntentAsyncWorkflows;
  'id': string;
  'last_payment_error'?: Record<string, any>;
  'latest_charge'?: Record<string, any>;
  'livemode': boolean;
  'managed_payments'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'next_action'?: Record<string, any>;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'payment_details'?: PaymentFlowsPaymentDetails;
  'payment_method'?: Record<string, any>;
  'payment_method_configuration_details'?: Record<string, any>;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types'?: string[];
  'presentment_details'?: PaymentFlowsPaymentIntentPresentmentDetails;
  'processing'?: Record<string, any>;
  'receipt_email'?: string;
  'review'?: Record<string, any>;
  'setup_future_usage'?: string;
  'shipping'?: Record<string, any>;
  'statement_descriptor'?: string;
  'statement_descriptor_suffix'?: string;
  'status': string;
  'transfer_data'?: Record<string, any>;
  'transfer_group'?: string;
};
```

### PaymentMethod

Source: src/types/Stripe.ts

```typescript
export type PaymentMethod = {
  'acss_debit'?: PaymentMethodAcssDebit;
  'affirm'?: PaymentMethodAffirm;
  'afterpay_clearpay'?: PaymentMethodAfterpayClearpay;
  'alipay'?: PaymentFlowsPrivatePaymentMethodsAlipay;
  'allow_redisplay'?: string;
  'alma'?: PaymentMethodAlma;
  'amazon_pay'?: PaymentMethodAmazonPay;
  'au_becs_debit'?: PaymentMethodAuBecsDebit;
  'bacs_debit'?: PaymentMethodBacsDebit;
  'bancontact'?: PaymentMethodBancontact;
  'billie'?: PaymentMethodBillie;
  'billing_details': BillingDetails;
  'bizum'?: PaymentMethodBizum;
  'blik'?: PaymentMethodBlik;
  'boleto'?: PaymentMethodBoleto;
  'card'?: PaymentMethodCard;
  'card_present'?: PaymentMethodCardPresent;
  'cashapp'?: PaymentMethodCashapp;
  'created': number;
  'crypto'?: PaymentMethodCrypto;
  'custom'?: PaymentMethodCustom;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'customer_balance'?: PaymentMethodCustomerBalance;
  'eps'?: PaymentMethodEps;
  'fpx'?: PaymentMethodFpx;
  'giropay'?: PaymentMethodGiropay;
  'grabpay'?: PaymentMethodGrabpay;
  'id': string;
  'ideal'?: PaymentMethodIdeal;
  'interac_present'?: PaymentMethodInteracPresent;
  'kakao_pay'?: PaymentMethodKakaoPay;
  'klarna'?: PaymentMethodKlarna;
  'konbini'?: PaymentMethodKonbini;
  'kr_card'?: PaymentMethodKrCard;
  'link'?: PaymentMethodLink;
  'livemode': boolean;
  'mb_way'?: PaymentMethodMbWay;
  'metadata'?: Record<string, any>;
  'mobilepay'?: PaymentMethodMobilepay;
  'multibanco'?: PaymentMethodMultibanco;
  'naver_pay'?: PaymentMethodNaverPay;
  'nz_bank_account'?: PaymentMethodNzBankAccount;
  'object': string;
  'oxxo'?: PaymentMethodOxxo;
  'p24'?: PaymentMethodP24;
  'pay_by_bank'?: PaymentMethodPayByBank;
  'payco'?: PaymentMethodPayco;
  'paynow'?: PaymentMethodPaynow;
  'paypal'?: PaymentMethodPaypal;
  'payto'?: PaymentMethodPayto;
  'pix'?: PaymentMethodPix;
  'promptpay'?: PaymentMethodPromptpay;
  'radar_options'?: RadarRadarOptions;
  'revolut_pay'?: PaymentMethodRevolutPay;
  'samsung_pay'?: PaymentMethodSamsungPay;
  'satispay'?: PaymentMethodSatispay;
  'scalapay'?: PaymentMethodScalapay;
  'sepa_debit'?: PaymentMethodSepaDebit;
  'sofort'?: PaymentMethodSofort;
  'sunbit'?: PaymentMethodSunbit;
  'swish'?: PaymentMethodSwish;
  'twint'?: PaymentMethodTwint;
  'type': string;
  'upi'?: PaymentMethodUpi;
  'us_bank_account'?: PaymentMethodUsBankAccount;
  'wechat_pay'?: PaymentMethodWechatPay;
  'zip'?: PaymentMethodZip;
};
```

### PaymentMethodAcssDebit

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodAcssDebit = {
  'bank_name'?: string;
  'fingerprint'?: string;
  'institution_number'?: string;
  'last4'?: string;
  'transit_number'?: string;
};
```

### PaymentMethodAffirm

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodAffirm = Record<string, any>;
```

### PaymentMethodAfterpayClearpay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodAfterpayClearpay = Record<string, any>;
```

### PaymentMethodAlma

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodAlma = Record<string, any>;
```

### PaymentMethodAmazonPay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodAmazonPay = Record<string, any>;
```

### PaymentMethodAuBecsDebit

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodAuBecsDebit = {
  'bsb_number'?: string;
  'fingerprint'?: string;
  'last4'?: string;
};
```

### PaymentMethodBacsDebit

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodBacsDebit = {
  'fingerprint'?: string;
  'last4'?: string;
  'sort_code'?: string;
};
```

### PaymentMethodBancontact

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodBancontact = Record<string, any>;
```

### PaymentMethodBillie

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodBillie = Record<string, any>;
```

### PaymentMethodBizum

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodBizum = {
  'buyer_id'?: string;
};
```

### PaymentMethodBlik

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodBlik = {
  'buyer_id'?: string;
};
```

### PaymentMethodBoleto

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodBoleto = {
  'tax_id': string;
};
```

### PaymentMethodCard

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodCard = {
  'brand': string;
  'checks'?: Record<string, any>;
  'country'?: string;
  'display_brand'?: string;
  'exp_month': number;
  'exp_year': number;
  'fingerprint'?: string;
  'funding': string;
  'generated_from'?: Record<string, any>;
  'last4': string;
  'networks'?: Record<string, any>;
  'regulated_status'?: string;
  'three_d_secure_usage'?: Record<string, any>;
  'wallet'?: Record<string, any>;
};
```

### PaymentMethodCardPresent

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodCardPresent = {
  'brand'?: string;
  'brand_product'?: string;
  'cardholder_name'?: string;
  'country'?: string;
  'description'?: string;
  'exp_month': number;
  'exp_year': number;
  'fingerprint'?: string;
  'funding'?: string;
  'issuer'?: string;
  'last4'?: string;
  'networks'?: Record<string, any>;
  'offline'?: Record<string, any>;
  'preferred_locales'?: string[];
  'read_method'?: string;
  'wallet'?: PaymentFlowsPrivatePaymentMethodsCardPresentCommonWallet;
};
```

### PaymentMethodCashapp

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodCashapp = {
  'buyer_id'?: string;
  'cashtag'?: string;
};
```

### PaymentMethodCrypto

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodCrypto = Record<string, any>;
```

### PaymentMethodCustom

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodCustom = {
  'display_name'?: string;
  'logo'?: Record<string, any>;
  'type': string;
};
```

### PaymentMethodCustomerBalance

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodCustomerBalance = Record<string, any>;
```

### PaymentMethodEps

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodEps = {
  'bank'?: string;
};
```

### PaymentMethodFpx

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodFpx = {
  'bank': string;
};
```

### PaymentMethodGiropay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodGiropay = Record<string, any>;
```

### PaymentMethodGrabpay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodGrabpay = Record<string, any>;
```

### PaymentMethodIdeal

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodIdeal = {
  'bank'?: string;
  'bic'?: string;
};
```

### PaymentMethodInteracPresent

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodInteracPresent = {
  'brand'?: string;
  'cardholder_name'?: string;
  'country'?: string;
  'description'?: string;
  'exp_month': number;
  'exp_year': number;
  'fingerprint'?: string;
  'funding'?: string;
  'issuer'?: string;
  'last4'?: string;
  'networks'?: Record<string, any>;
  'preferred_locales'?: string[];
  'read_method'?: string;
};
```

### PaymentMethodKakaoPay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodKakaoPay = Record<string, any>;
```

### PaymentMethodKlarna

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodKlarna = {
  'dob'?: Record<string, any>;
};
```

### PaymentMethodKonbini

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodKonbini = Record<string, any>;
```

### PaymentMethodKrCard

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodKrCard = {
  'brand'?: string;
  'last4'?: string;
};
```

### PaymentMethodLink

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodLink = {
  'email'?: string;
};
```

### PaymentMethodMbWay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodMbWay = Record<string, any>;
```

### PaymentMethodMobilepay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodMobilepay = Record<string, any>;
```

### PaymentMethodMultibanco

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodMultibanco = Record<string, any>;
```

### PaymentMethodNaverPay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodNaverPay = {
  'buyer_id'?: string;
  'funding': string;
};
```

### PaymentMethodNzBankAccount

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodNzBankAccount = {
  'account_holder_name'?: string;
  'bank_code': string;
  'bank_name': string;
  'branch_code': string;
  'last4': string;
  'suffix'?: string;
};
```

### PaymentMethodOxxo

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodOxxo = Record<string, any>;
```

### PaymentMethodP24

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodP24 = {
  'bank'?: string;
};
```

### PaymentMethodPayByBank

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPayByBank = Record<string, any>;
```

### PaymentMethodPayco

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPayco = Record<string, any>;
```

### PaymentMethodPaynow

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPaynow = Record<string, any>;
```

### PaymentMethodPaypal

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPaypal = {
  'country'?: string;
  'payer_email'?: string;
  'payer_id'?: string;
};
```

### PaymentMethodPayto

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPayto = {
  'bsb_number'?: string;
  'last4'?: string;
  'pay_id'?: string;
};
```

### PaymentMethodPix

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPix = {
  'fingerprint'?: string;
};
```

### PaymentMethodPromptpay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodPromptpay = Record<string, any>;
```

### PaymentMethodRevolutPay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodRevolutPay = Record<string, any>;
```

### PaymentMethodSamsungPay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodSamsungPay = Record<string, any>;
```

### PaymentMethodSatispay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodSatispay = Record<string, any>;
```

### PaymentMethodScalapay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodScalapay = Record<string, any>;
```

### PaymentMethodSepaDebit

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodSepaDebit = {
  'bank_code'?: string;
  'branch_code'?: string;
  'country'?: string;
  'fingerprint'?: string;
  'generated_from'?: Record<string, any>;
  'last4'?: string;
};
```

### PaymentMethodSofort

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodSofort = {
  'country'?: string;
};
```

### PaymentMethodSunbit

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodSunbit = Record<string, any>;
```

### PaymentMethodSwish

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodSwish = Record<string, any>;
```

### PaymentMethodTwint

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodTwint = Record<string, any>;
```

### PaymentMethodUpi

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodUpi = {
  'vpa'?: string;
};
```

### PaymentMethodUsBankAccount

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodUsBankAccount = {
  'account_holder_type'?: string;
  'account_type'?: string;
  'bank_name'?: string;
  'financial_connections_account'?: string;
  'fingerprint'?: string;
  'last4'?: string;
  'networks'?: Record<string, any>;
  'routing_number'?: string;
  'status_details'?: Record<string, any>;
};
```

### PaymentMethodWechatPay

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodWechatPay = Record<string, any>;
```

### PaymentMethodZip

Source: src/types/Stripe.ts

```typescript
export type PaymentMethodZip = Record<string, any>;
```

### PaymentPagesCheckoutSessionAutomaticTax

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionAutomaticTax = {
  'enabled': boolean;
  'liability'?: Record<string, any>;
  'provider'?: string;
  'status'?: string;
};
```

### PaymentPagesCheckoutSessionBrandingSettings

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionBrandingSettings = {
  'background_color': string;
  'border_style': string;
  'button_color': string;
  'display_name': string;
  'font_family': string;
  'icon'?: Record<string, any>;
  'logo'?: Record<string, any>;
};
```

### PaymentPagesCheckoutSessionBusinessName

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionBusinessName = {
  'enabled': boolean;
  'optional': boolean;
};
```

### PaymentPagesCheckoutSessionCustomFields

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomFields = {
  'dropdown'?: PaymentPagesCheckoutSessionCustomFieldsDropdown;
  'key': string;
  'label': PaymentPagesCheckoutSessionCustomFieldsLabel;
  'numeric'?: PaymentPagesCheckoutSessionCustomFieldsNumeric;
  'optional': boolean;
  'text'?: PaymentPagesCheckoutSessionCustomFieldsText;
  'type': string;
};
```

### PaymentPagesCheckoutSessionCustomFieldsDropdown

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomFieldsDropdown = {
  'default_value'?: string;
  'options': PaymentPagesCheckoutSessionCustomFieldsOption[];
  'value'?: string;
};
```

### PaymentPagesCheckoutSessionCustomFieldsLabel

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomFieldsLabel = {
  'custom'?: string;
  'type': string;
};
```

### PaymentPagesCheckoutSessionCustomFieldsNumeric

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomFieldsNumeric = {
  'default_value'?: string;
  'maximum_length'?: number;
  'minimum_length'?: number;
  'value'?: string;
};
```

### PaymentPagesCheckoutSessionCustomFieldsOption

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomFieldsOption = {
  'label': string;
  'value': string;
};
```

### PaymentPagesCheckoutSessionCustomFieldsText

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomFieldsText = {
  'default_value'?: string;
  'maximum_length'?: number;
  'minimum_length'?: number;
  'value'?: string;
};
```

### PaymentPagesCheckoutSessionCustomText

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionCustomText = {
  'after_submit'?: Record<string, any>;
  'shipping_address'?: Record<string, any>;
  'submit'?: Record<string, any>;
  'terms_of_service_acceptance'?: Record<string, any>;
};
```

### PaymentPagesCheckoutSessionDiscount

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionDiscount = {
  'coupon'?: Record<string, any>;
  'promotion_code'?: Record<string, any>;
};
```

### PaymentPagesCheckoutSessionIndividualName

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionIndividualName = {
  'enabled': boolean;
  'optional': boolean;
};
```

### PaymentPagesCheckoutSessionNameCollection

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionNameCollection = {
  'business'?: PaymentPagesCheckoutSessionBusinessName;
  'individual'?: PaymentPagesCheckoutSessionIndividualName;
};
```

### PaymentPagesCheckoutSessionOptionalItem

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionOptionalItem = {
  'adjustable_quantity'?: Record<string, any>;
  'price': string;
  'quantity': number;
};
```

### PaymentPagesCheckoutSessionPhoneNumberCollection

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionPhoneNumberCollection = {
  'enabled': boolean;
};
```

### PaymentPagesCheckoutSessionShippingOption

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionShippingOption = {
  'shipping_amount': number;
  'shipping_rate': Record<string, any>;
};
```

### PaymentPagesCheckoutSessionTaxIdCollection

Source: src/types/Stripe.ts

```typescript
export type PaymentPagesCheckoutSessionTaxIdCollection = {
  'enabled': boolean;
  'required': string;
};
```

### Price

Source: src/types/Stripe.ts

```typescript
export type Price = {
  'active': boolean;
  'billing_scheme': string;
  'created': number;
  'currency': string;
  'currency_options'?: Record<string, any>;
  'custom_unit_amount'?: Record<string, any>;
  'id': string;
  'livemode': boolean;
  'lookup_key'?: string;
  'metadata': Record<string, any>;
  'nickname'?: string;
  'object': string;
  'product': Record<string, any>;
  'recurring'?: Record<string, any>;
  'tax_behavior'?: string;
  'tiers'?: PriceTier[];
  'tiers_mode'?: string;
  'transform_quantity'?: Record<string, any>;
  'type': string;
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
};
```

### PriceTier

Source: src/types/Stripe.ts

```typescript
export type PriceTier = {
  'flat_amount'?: number;
  'flat_amount_decimal'?: string;
  'unit_amount'?: number;
  'unit_amount_decimal'?: string;
  'up_to'?: number;
};
```

### Product

Source: src/types/Stripe.ts

```typescript
export type Product = {
  'active': boolean;
  'created': number;
  'default_price'?: Record<string, any>;
  'description'?: string;
  'id': string;
  'images': string[];
  'livemode': boolean;
  'marketing_features': ProductMarketingFeature[];
  'metadata': Record<string, any>;
  'name': string;
  'object': string;
  'package_dimensions'?: Record<string, any>;
  'shippable'?: boolean;
  'statement_descriptor'?: string;
  'tax_code'?: Record<string, any>;
  'unit_label'?: string;
  'updated': number;
  'url'?: string;
};
```

### ProductMarketingFeature

Source: src/types/Stripe.ts

```typescript
export type ProductMarketingFeature = {
  'name'?: string;
};
```

### RadarRadarOptions

Source: src/types/Stripe.ts

```typescript
export type RadarRadarOptions = {
  'session'?: string;
};
```

### SetupIntent

Source: src/types/Stripe.ts

```typescript
export type SetupIntent = {
  'allowed_payment_method_types'?: string[];
  'application'?: Record<string, any>;
  'attach_to_self'?: boolean;
  'automatic_payment_methods'?: Record<string, any>;
  'cancellation_reason'?: string;
  'client_secret'?: string;
  'created': number;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'description'?: string;
  'excluded_payment_method_types'?: string[];
  'flow_directions'?: string[];
  'id': string;
  'last_setup_error'?: Record<string, any>;
  'latest_attempt'?: Record<string, any>;
  'livemode': boolean;
  'managed_payments'?: Record<string, any>;
  'mandate'?: Record<string, any>;
  'metadata'?: Record<string, any>;
  'next_action'?: Record<string, any>;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'payment_method'?: Record<string, any>;
  'payment_method_configuration_details'?: Record<string, any>;
  'payment_method_options'?: Record<string, any>;
  'payment_method_types': string[];
  'single_use_mandate'?: Record<string, any>;
  'status': string;
  'usage': string;
};
```

### Subscription

Source: src/types/Stripe.ts

```typescript
export type Subscription = {
  'application'?: Record<string, any>;
  'application_fee_percent'?: number;
  'automatic_tax': SubscriptionAutomaticTax;
  'billing_cycle_anchor': number;
  'billing_cycle_anchor_config'?: Record<string, any>;
  'billing_mode': SubscriptionsResourceBillingMode;
  'billing_schedules': SubscriptionsResourceBillingSchedules[];
  'billing_thresholds'?: Record<string, any>;
  'cancel_at'?: number;
  'cancel_at_period_end': boolean;
  'canceled_at'?: number;
  'cancellation_details'?: Record<string, any>;
  'collection_method': string;
  'created': number;
  'currency': string;
  'customer': Record<string, any>;
  'customer_account'?: string;
  'days_until_due'?: number;
  'default_payment_method'?: Record<string, any>;
  'default_source'?: Record<string, any>;
  'default_tax_rates'?: TaxRate[];
  'description'?: string;
  'discounts': Record<string, any>[];
  'ended_at'?: number;
  'id': string;
  'invoice_settings': SubscriptionsResourceSubscriptionInvoiceSettings;
  'items': {
    'data': SubscriptionItem[];
    'has_more': boolean;
    'object': string;
    'url': string;
  };
  'latest_invoice'?: Record<string, any>;
  'livemode': boolean;
  'managed_payments'?: Record<string, any>;
  'metadata': Record<string, any>;
  'next_pending_invoice_item_invoice'?: number;
  'object': string;
  'on_behalf_of'?: Record<string, any>;
  'pause_collection'?: Record<string, any>;
  'payment_settings'?: Record<string, any>;
  'pending_invoice_item_interval'?: Record<string, any>;
  'pending_setup_intent'?: Record<string, any>;
  'pending_update'?: Record<string, any>;
  'presentment_details'?: SubscriptionsResourceSubscriptionPresentmentDetails;
  'schedule'?: Record<string, any>;
  'start_date': number;
  'status': string;
  'test_clock'?: Record<string, any>;
  'transfer_data'?: Record<string, any>;
  'trial_end'?: number;
  'trial_settings'?: Record<string, any>;
  'trial_start'?: number;
};
```

### SubscriptionAutomaticTax

Source: src/types/Stripe.ts

```typescript
export type SubscriptionAutomaticTax = {
  'disabled_reason'?: string;
  'enabled': boolean;
  'liability'?: Record<string, any>;
};
```

### SubscriptionItem

Source: src/types/Stripe.ts

```typescript
export type SubscriptionItem = {
  'billed_until'?: number;
  'billing_thresholds'?: Record<string, any>;
  'created': number;
  'current_period_end': number;
  'current_period_start': number;
  'discounts': Record<string, any>[];
  'id': string;
  'metadata': Record<string, any>;
  'object': string;
  'price': Price;
  'quantity'?: number;
  'subscription': string;
  'tax_rates'?: TaxRate[];
};
```

### SubscriptionsResourceBillingMode

Source: src/types/Stripe.ts

```typescript
export type SubscriptionsResourceBillingMode = {
  'flexible'?: Record<string, any>;
  'type': string;
  'updated_at'?: number;
};
```

### SubscriptionsResourceBillingSchedules

Source: src/types/Stripe.ts

```typescript
export type SubscriptionsResourceBillingSchedules = {
  'applies_to'?: SubscriptionsResourceBillingSchedulesAppliesTo[];
  'bill_until': SubscriptionsResourceBillingSchedulesBillUntil;
  'key': string;
};
```

### SubscriptionsResourceBillingSchedulesAppliesTo

Source: src/types/Stripe.ts

```typescript
export type SubscriptionsResourceBillingSchedulesAppliesTo = {
  'price'?: Record<string, any>;
  'type': string;
};
```

### SubscriptionsResourceBillingSchedulesBillUntil

Source: src/types/Stripe.ts

```typescript
export type SubscriptionsResourceBillingSchedulesBillUntil = {
  'computed_timestamp': number;
  'duration'?: Record<string, any>;
  'timestamp'?: number;
  'type': string;
};
```

### SubscriptionsResourceSubscriptionInvoiceSettings

Source: src/types/Stripe.ts

```typescript
export type SubscriptionsResourceSubscriptionInvoiceSettings = {
  'account_tax_ids'?: Record<string, any>[];
  'custom_fields'?: InvoiceSettingCustomField[];
  'description'?: string;
  'footer'?: string;
  'issuer': ConnectAccountReference;
};
```

### SubscriptionsResourceSubscriptionPresentmentDetails

Source: src/types/Stripe.ts

```typescript
export type SubscriptionsResourceSubscriptionPresentmentDetails = {
  'presentment_currency': string;
};
```

### TaxId

Source: src/types/Stripe.ts

```typescript
export type TaxId = {
  'country'?: string;
  'created': number;
  'customer'?: Record<string, any>;
  'customer_account'?: string;
  'id': string;
  'livemode': boolean;
  'object': string;
  'owner'?: Record<string, any>;
  'type': string;
  'value': string;
  'verification'?: Record<string, any>;
};
```

### TaxRate

Source: src/types/Stripe.ts

```typescript
export type TaxRate = {
  'active': boolean;
  'country'?: string;
  'created': number;
  'description'?: string;
  'display_name': string;
  'effective_percentage'?: number;
  'flat_amount'?: Record<string, any>;
  'id': string;
  'inclusive': boolean;
  'jurisdiction'?: string;
  'jurisdiction_level'?: string;
  'livemode': boolean;
  'metadata'?: Record<string, any>;
  'object': string;
  'percentage': number;
  'rate_type'?: string;
  'state'?: string;
  'tax_type'?: string;
};
```
