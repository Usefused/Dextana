// Auto-generated Core File. Do not edit manually.
// Powered by Fused - The integration layer for teams that want control.
// Custom SDKs, native webhooks, and MCP servers from services you actually use.
// Learn more at: https://usefused.com

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { trace, propagation, context, SpanStatusCode } from '@opentelemetry/api';
import { createHash, randomUUID } from 'crypto';
import path from 'path';


// --- types/service.ts ---
export interface Service {
  id?: string;
  name: string; // e.g. "stripe-payments" — unique, used as credential key
  // Registry always emits these identity fields. Empty strings remain valid
  // for private legacy rows, where collision handling falls back to the ID.
  slug: string;
  provider: string;
  description?: string;
  base_url?: string; // e.g. "https://api.stripe.com/v1"
  servers?: Server[];
  auth_configs: AuthConfig[];
  // Registry derives this from the immutable selected auth path, including
  // mixed required-auth sets and referenced credential sources.
  connected_auth?: boolean;
  rate_limit?: RateLimitConfig;
  retry_config?: RetryConfig;
  pagination?: PaginationPolicy;
  catalog?: CatalogComposition;
  incoming_webhook_config?: IncomingWebhookConfig;
  connect_config?: ConnectionProfile;
  default_headers?: Record<string, string>;
  endpoints?: IntegrationObject[];
  webhooks?: WebhookObject[];
  components?: Record<string, Schema>;
  // Complete version-pinned definitions accompany references once; generators
  // continue using the reviewed projection rather than reinterpreting raw JSON.
  schema_definitions?: Record<string, SchemaContract>;
  documentation?: ServiceDocumentation;
}

export interface WebhookObject {
  id?: string;
  name: string;
  description?: string;
  method: string;
  request_body?: Schema;
  contract?: InboundOperationContract;
}

export interface InboundOperationContract {
  kind: 'webhook' | 'callback';
  runtime_expression?: string;
  parent?: CallbackParent;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  external_docs?: ExternalDocumentation;
  deprecated: boolean;
  operation_servers?: Server[];
  parameters: Parameter[];
  request_content?: RequestContent;
  responses: Record<string, ResponseContract>;
  security_requirements: SecurityAlternative[];
  // Inbound references resolve here, independently of outbound credential configuration.
  security_schemes?: Record<string, InboundSecurityScheme>;
  extensions?: NamespacedExtensions;
}

// Standard source declarations are documentation, not executable verification policy.
export interface InboundSecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'mutualTLS';
  description?: string;
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: Partial<Record<OAuth2FlowName, InboundOAuthFlow>>;
  openIdConnectUrl?: string;
  oauth2MetadataUrl?: string;
  deprecated?: boolean;
}

// Preserve OpenAPI field names without projecting outbound OAuth acquisition defaults.
export interface InboundOAuthFlow {
  authorizationUrl?: string;
  deviceAuthorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface CallbackParent {
  operation_id: string;
  method: string;
  path: string;
  callback_name: string;
}

export interface AuthConfig {
  name?: string; // OpenAPI security scheme name, used as the Engine credential key
  type: string; // imported OpenAPI type or normalized Fused family, e.g. 'api_key', 'http', 'oauth', 'oidc', 'mtls'
  scheme?: string; // 'bearer', 'basic', etc
  location?: string; // 'header' | 'query' | 'cookie'
  key_name?: string; // header or query param name e.g. "Authorization", "api_key"
  token_endpoint_auth_method?: 'client_secret_basic' | 'client_secret_post';
  token_request_media_type?: 'application/x-www-form-urlencoded' | 'application/json';
  open_id_connect_url?: string; // for oidc
  oauth2_metadata_url?: string;
  deprecated?: boolean;
  pkce_required?: boolean; // authorization-code policy imported from provider documentation
  scopes_delimiter?: 'space' | 'comma';
  extra_auth_params?: Record<string, string>; // validated public authorization parameters only
  extra_token_params?: Record<string, string>; // validated public token parameters only
  refresh_token_required?: boolean;
  refresh_token_rotates?: boolean;
  oauth2_flows?: Partial<Record<OAuth2FlowName, OAuth2FlowContract>>;
  strategy?: AuthRuntimeStrategy;
  policy_provenance?: Record<string, 'source_spec' | 'x-fused' | 'reviewed_overlay'>;
}

export type OAuth2FlowName = 'implicit' | 'password' | 'clientCredentials' | 'authorizationCode' | 'deviceAuthorization';

export interface OAuth2FlowContract {
  authorization_url?: string;
  device_authorization_url?: string;
  token_url?: string;
  refresh_url?: string;
  scopes: Record<string, string>;
}

export interface AuthRuntimeStrategy {
  kind: 'oauth1_signature' | 'http_challenge';
  oauth1?: OAuth1Strategy;
  challenge?: HTTPChallengeStrategy;
}

export interface OAuth1Strategy {
  signature_method: 'hmac_sha1' | 'hmac_sha256';
  parameter_location: 'authorization_header';
}

export interface HTTPChallengeStrategy {
  scheme: 'digest' | string;
}

export interface RateLimitConfig {
  version: 3;
  policies: RateLimitPolicy[];
  cooldown?: RateLimitCooldown;
}

export interface RateLimitPolicy {
  name: string;
  mode: 'enforce' | 'observe';
  unit: 'requests' | 'points' | 'complexity' | 'quota_units';
  identity: RateLimitBucketIdentity;
  cost: RateLimitCostPlan;
  algorithm: 'fixed_window' | 'rolling_window' | 'token_bucket' | 'concurrency';
  fixed_window?: RateLimitFixedWindow;
  rolling_window?: RateLimitRollingWindow;
  token_bucket?: RateLimitTokenBucket;
  concurrency?: RateLimitConcurrency;
  response_signals?: RateLimitResponseSignals;
}

export interface RateLimitBucketIdentity {
  inputs: RateLimitIdentityInput[];
}

export interface RateLimitIdentityInput {
  kind:
    | 'account'
    | 'service_version'
    | 'connection'
    | 'project'
    | 'tenant'
    | 'resource'
    | 'ip_class'
    | 'named_shared_credential_family';
  binding?: string;
  name?: string;
}

export interface RateLimitCostPlan {
  default: number;
  rules: RateLimitCostRule[];
}

export interface RateLimitCostRule {
  operation: string;
  cost: number;
}

export interface RateLimitFixedWindow {
  limit: number;
  duration_ms: number;
}

export interface RateLimitTokenBucket {
  capacity: number;
  refill_units: number;
  refill_interval_ms: number;
}

export interface RateLimitRollingWindow {
  limit: number;
  duration_ms: number;
}

export interface RateLimitConcurrency {
  limit: number;
}

export interface RateLimitResponseSignals {
  limit?: RateLimitResponseSignal;
  remaining?: RateLimitResponseSignal;
  reset?: RateLimitResetSignal;
  cost?: RateLimitResponseSignal;
}

export interface RateLimitResponseSignal {
  source: 'header' | 'body';
  name?: string;
  path?: string;
}

export interface RateLimitResetSignal {
  signal: RateLimitResponseSignal;
  format: RateLimitResetFormat;
}

export type RateLimitResetFormat =
  | 'delta_seconds'
  | 'delta_milliseconds'
  | 'unix_seconds'
  | 'unix_milliseconds'
  | 'rfc3339'
  | 'http_date';

export interface RateLimitCooldown {
  statuses: RateLimitStatusRange[];
  headers: RateLimitCooldownHeader[];
}

export interface RateLimitStatusRange {
  min: number;
  max: number;
}

export interface RateLimitCooldownHeader {
  name: string;
  formats: RateLimitResetFormat[];
  max_delay_ms: number;
}

export interface RetryConfig {
  version: 3;
  rules: RetryRule[];
}

export interface RetryRule {
  predicates: RetryPredicates;
  action: RetryAction;
}

export interface RetryPredicates {
  methods: string[];
  operation_kinds: Array<'read' | 'write' | 'delete' | 'stream' | 'query' | 'mutation'>;
  statuses: RetryStatusRange[];
  errors: Array<'connect_timeout' | 'read_timeout' | 'connection_reset' | 'temporary_dns' | 'tls_handshake' | 'transport'>;
  body_replayability: 'any' | 'replayable' | 'not_replayable';
  idempotency_key: RetryIdempotencyKeyPredicate;
  required_provider_headers: string[];
}

export interface RetryStatusRange {
  min: number;
  max: number;
}

export interface RetryIdempotencyKeyPredicate {
  requirement: 'any' | 'required' | 'absent';
  header?: string;
}

export interface RetryAction {
  max_attempts: number;
  max_elapsed_ms: number;
  backoff: RetryBackoff;
  retry_after_headers: RetryAfterHeader[];
}

export interface RetryBackoff {
  strategy: 'fixed' | 'exponential';
  base_delay_ms: number;
  max_delay_ms: number;
  jitter_ms: number;
}

export interface RetryAfterHeader {
  name: string;
  formats: Array<'delta_seconds' | 'unix_seconds' | 'unix_milliseconds' | 'rfc3339' | 'http_date'>;
  max_delay_ms: number;
}

export interface IncomingWebhookConfig {
  auth_type: string;
  auth_location?: string;
  auth_key_name?: string;
  signature_header?: string;
  verification_headers?: string[];
  signature_policy?: SignaturePolicy;
}

export interface SignaturePolicy {
  version: 1;
  rules: SignatureRule[];
}

export interface SignatureRule {
  name: string;
  kind: 'challenge' | 'event';
  predicates: SignaturePredicate[];
  verification: SignatureVerification;
}

export interface SignaturePredicate {
  source: SignatureValueSource;
  operator: 'present' | 'absent' | 'equals';
  value?: string;
}

export interface SignatureValueSource {
  location: 'header' | 'query' | 'body';
  name?: string;
  path?: string;
}

export interface SignatureVerification {
  kind: 'signature' | 'jwt' | 'challenge_response';
  signature?: SignatureRecipe;
  jwt?: JWTVerification;
  challenge?: ChallengeResponse;
}

export interface SignatureRecipe {
  secret_ref: string;
  signature: SignatureValueSource;
  components: SignatureInputComponent[];
  algorithm: 'hmac_sha1' | 'hmac_sha256' | 'hmac_sha512';
  encoding: SignatureEncoding;
  comparison: 'constant_time';
  prefix?: string;
  component_separator: string;
}

export interface SignatureInputComponent {
  kind: 'raw_body' | 'exact_callback_url' | 'selected_headers' | 'selected_query' | 'sorted_form' | 'body_hash';
  names: string[];
  join?: 'concat_values' | 'concat_name_value' | 'form_urlencoded';
  algorithm?: 'sha256' | 'sha512';
  encoding?: SignatureEncoding;
}

export type SignatureEncoding = 'hex' | 'base64' | 'base64url';

export interface JWTVerification {
  secret_ref: string;
  token: SignatureValueSource;
  algorithms: string[];
  issuer?: string;
  audience?: string;
  clock_skew_ms: number;
}

export interface ChallengeResponse {
  value: SignatureValueSource;
  body_field: string;
  status_code: number;
}

export interface CatalogComposition {
  version: 1;
  collision_policy: 'reject';
  sources: CatalogSource[];
}

export interface CatalogSource {
  name: string;
  namespace: string;
  source_ref: string;
  operation_prefix: string;
}

export interface ConnectionProfile {
  auth_type?: string;
  auth_name?: string;
  oauth2_flow?: string;
  resource_discovery?: ResourceDiscovery;
  resource_input?: ResourceInput;
  metadata?: Record<string, string>;
  bindings?: ResourceBinding[];
}

export interface ResourceDiscovery {
  version: 1;
  stage: string;
  operation_id: string;
  server?: string;
  id_path: string;
  name_path?: string;
  base_url_path?: string;
  base_url_template?: string;
  scopes_path?: string;
  resource_type: string;
  auto_run?: string;
  lifecycle?: string;
  allowed_hosts?: string[];
}

export interface ResourceInput {
  fields: ResourceInputField[];
  base_url_template: string;
  resource_type: string;
  allowed_hosts?: string[];
  discovery_match?: ResourceInputDiscoveryMatch;
}

export interface ResourceInputDiscoveryMatch {
  metadata_key: string;
}

export interface ResourceInputField {
  name: string;
  type?: ResourceInputFieldType;
  label?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  pattern?: string;
  options?: ResourceInputOption[];
}

export type ResourceInputFieldType = "text" | "select";

export interface ResourceInputOption {
  value: string;
  label?: string;
}

export interface ResourceBinding {
  value: string;
  location: string;
  name?: string;
  mode: string;
  operations?: string[];
  provider_extension?: boolean;
}

export interface UploadWorkflow {
  version: 1;
  accepted_media_types: string[];
  max_size_bytes?: number;
  modes: UploadMode[];
}

export interface UploadMode {
  kind: 'simple' | 'multipart' | 'resumable';
  steps: UploadStep[];
}

export interface UploadStep {
  kind: 'initiate' | 'transfer';
  method: string;
  url: UploadURLSource;
  body: 'metadata' | 'media' | 'multipart';
  chunking?: UploadChunking;
  success_statuses: UploadStatusRange[];
  continue_statuses: UploadStatusRange[];
}

export interface UploadURLSource {
  kind: 'declared_path' | 'response_header';
  path?: string;
  header_name?: string;
  allowed_origins?: string[];
}

export interface UploadStatusRange {
  min: number;
  max: number;
}

export interface UploadChunking {
  default_size_bytes: number;
  size_multiple_bytes: number;
  max_size_bytes: number;
}

// Pagination policy is generator input metadata only. Generated clients send
// the operation call once and let Engine apply this policy so repeated-token,
// origin, and total-limit safety cannot diverge between language runtimes.
export interface PaginationPolicy {
  version: number;
  request: PaginationRequestStep[];
  response: PaginationResponsePlan;
  continuation: PaginationContinuationStep[];
  termination: PaginationTermination;
  graphql?: PaginationGraphQLPlan;
  limits: PaginationLimits;

  // Registry upgrades reviewed v2 policies before publication. These fields
  // remain transport-visible while stored development configuration migrates.
  type?: 'cursor' | 'offset' | 'page_number' | 'next_url';
  cursor?: PaginationCursor;
  offset?: PaginationOffset;
  page_number?: PaginationPageNumber;
  next_url?: PaginationNextURL;
  items_path?: string;
}

export type PaginationValueType = 'string' | 'integer' | 'boolean' | 'url';
export type PaginationPageApplication = 'all' | 'first' | 'subsequent';
export type PaginationConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'present'
  | 'absent'
  | 'state_gte';

export interface PaginationRequestStep {
  state?: string;
  target: PaginationRequestTarget;
  value_type: PaginationValueType;
  initial?: PaginationScalar;
  constant?: PaginationScalar;
  apply: PaginationPageApplication;
}

export interface PaginationResponsePlan {
  items: PaginationItemsSource;
  values: PaginationResponseValue[];
}

export interface PaginationItemsSource {
  path?: string;
  paths?: PaginationConditionalPath[];
}

export interface PaginationResponseValue {
  name: string;
  source: PaginationValueSource;
}

export interface PaginationConditionalPath {
  path: string;
  when: PaginationRequestCondition;
}

export interface PaginationRequestCondition {
  state: string;
  operator: PaginationConditionOperator;
  value?: PaginationScalar;
}

export interface PaginationItemSelector {
  position: 'last';
  path?: string;
}

export interface PaginationContinuationStep {
  kind: 'token' | 'offset' | 'page' | 'rfc_link' | 'next_url';
  state: string;
  response_value?: string;
  increment?: PaginationIncrement;
  origin?: PaginationOriginPolicy;
}

export interface PaginationOriginPolicy {
  mode: 'same_origin' | 'allowlist';
  allowed_origins?: string[];
}

export interface PaginationTermination {
  stop_on_empty_items?: boolean;
  stop_on_short_page?: PaginationShortPageTermination;
  stop_on_missing_values?: string[];
  conditions?: PaginationResponseCondition[];
  repeated_value: 'stop' | 'error';
}

export interface PaginationShortPageTermination {
  request_state: string;
}

export interface PaginationResponseCondition {
  response_value: string;
  state?: string;
  operator: PaginationConditionOperator;
  value?: PaginationScalar;
}

export interface PaginationGraphQLPlan {
  variables: PaginationGraphQLVariable[];
  result_aliases: PaginationGraphQLResultAlias[];
  first_page_template: string;
  subsequent_page_template: string;
}

export interface PaginationGraphQLVariable {
  name: string;
  state: string;
  value_type: PaginationValueType;
}

export interface PaginationGraphQLResultAlias {
  name: string;
  alias: string;
}

export interface PaginationRequestTarget {
  location: 'query' | 'header' | 'body' | 'graphql_variable';
  name: string;
}

export interface PaginationValueSource {
  location: 'body' | 'header' | 'link' | 'items' | 'graphql';
  path?: string;
  name?: string;
  relation?: string;
  value_type: PaginationValueType;
  paths?: PaginationConditionalPath[];
  item?: PaginationItemSelector;
}

export interface PaginationScalar {
  type: PaginationValueType;
  string?: string;
  integer?: number;
  boolean?: boolean;
}

export interface PaginationIncrement {
  mode: 'fixed' | 'items_returned';
  value?: number;
}

export interface PaginationLimits {
  max_pages: number;
  max_items: number;
  max_bytes: number;
  max_duration_ms: number;
}

export interface PaginationCursor {
  request: PaginationRequestTarget;
  initial?: PaginationScalar;
  next: PaginationValueSource;
  has_more?: PaginationValueSource;
}

export interface PaginationPageSize {
  target: PaginationRequestTarget;
  value: number;
}

export interface PaginationOffset {
  request: PaginationRequestTarget;
  start: number;
  increment: PaginationIncrement;
  page_size?: PaginationPageSize;
  next_offset?: PaginationValueSource;
  total_items?: PaginationValueSource;
  has_more?: PaginationValueSource;
  stop_on_short_page?: boolean;
}

export interface PaginationPageNumber {
  request: PaginationRequestTarget;
  start: number;
  increment: number;
  page_size?: PaginationPageSize;
  total_pages?: PaginationValueSource;
  has_more?: PaginationValueSource;
  stop_on_short_page?: boolean;
}

export interface PaginationNextURL {
  next: PaginationValueSource;
}

export interface IntegrationObject {
  id?: string;
  name: string; // e.g. "create_payment_intent"
  description: string;
  resource?: string; // e.g. "payments"
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | string;
  path: string; // e.g. "/payment_intents"
  operation_servers?: Server[];
  parameters?: Parameter[] | null;
  request_content?: RequestContent;
  responses?: Record<string, ResponseContract>;
  security_requirements?: SecurityAlternative[];
  documentation?: OperationDocumentation;
  graphql_query?: string;
  pagination?: PaginationPolicy;
}

export interface SecurityAlternative {
  schemes: SecurityRequirement[];
  server_selection?: SecurityServerSelection;
}

export interface SecurityRequirement {
  scheme: string;
  scopes: string[];
}

export interface SecurityServerSelection {
  scheme: string;
  server_url: string;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie' | string;
  required: boolean;
  type?: string;
  // Normalized OpenAPI parameters can carry a full schema. Keeping it here
  // lets type reachability include parameter-only component models.
  schema?: SchemaContract;
  content?: Record<string, ParameterContent>;
  description?: string;
  path_encoding?: string;
  serialization?: ParameterSerialization;
  deprecated?: boolean;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface ParameterSerialization {
  style: string;
  explode: boolean | null;
  allow_reserved: boolean | null;
  allow_empty_value: boolean | null;
}

export interface ParameterContent {
  schema?: SchemaContract;
  item_schema?: SchemaContract;
  encoding?: Record<string, RequestEncoding>;
  prefix_encoding?: RequestEncoding[];
  item_encoding?: RequestEncoding;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface SchemaContract {
  dialect: string;
  raw: unknown;
  content_hash: string;
  projection: Schema;
  projection_diagnostics?: SchemaProjectionDiagnostic[];
  // References bind to the service version's schema_definitions dictionary.
  shared_definitions?: boolean;
}

export interface SchemaProjectionDiagnostic {
  code: string;
  keyword: string;
  pointer: string;
  message: string;
}

export interface RequestContent {
  media_type: string;
  serialization: string;
  required?: boolean;
  schema?: Schema;
  payload_parameter?: string;
  binary_encoding?: string;
  parts?: Record<string, RequestPart>;
  representations: RequestRepresentation[];
  default_media_type?: string;
  upload_workflow?: UploadWorkflow;
}

export interface RequestPart {
  content_type?: string;
  binary_encoding?: string;
}

export interface RequestRepresentation {
  media_type: string;
  serialization: string;
  schema?: SchemaContract;
  item_schema?: SchemaContract;
  encoding?: Record<string, RequestEncoding>;
  prefix_encoding?: RequestEncoding[];
  item_encoding?: RequestEncoding;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface RequestEncoding {
  content_type?: string;
  headers?: Record<string, HeaderContract>;
  style?: string;
  explode?: boolean;
  allow_reserved?: boolean;
  binary_encoding?: string;
  encoding?: Record<string, RequestEncoding>;
  prefix_encoding?: RequestEncoding[];
  item_encoding?: RequestEncoding;
}

export interface HeaderContract {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  serialization: ParameterSerialization;
  schema?: SchemaContract;
  content?: Record<string, ParameterContent>;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface ResponseContract {
  summary?: string;
  description: string;
  headers?: Record<string, HeaderContract>;
  representations: ResponseRepresentation[];
  links?: Record<string, LinkContract>;
}

export interface ResponseRepresentation {
  media_type: string;
  schema?: SchemaContract;
  item_schema?: SchemaContract;
  sse?: SSEResponseContract;
  prefix_encoding?: RequestEncoding[];
  item_encoding?: RequestEncoding;
  example?: unknown;
  examples?: Record<string, unknown>;
}

export interface SSEResponseContract {
  item_mode: 'data';
  done_sentinel?: string;
}

export interface LinkContract {
  operation_ref?: string;
  operation_id?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  request_body?: unknown;
  server?: Server;
  extensions?: NamespacedExtensions;
}

export type NamespacedExtensions = Record<string, NamespacedExtension>;

export interface NamespacedExtension {
  value: unknown;
  provenance: 'source_spec';
}

export interface ExternalDocumentation {
  description?: string;
  url: string;
}

export interface OperationDocumentation {
  summary?: string;
  description?: string;
  tags: string[];
  external_docs?: ExternalDocumentation;
  extensions?: NamespacedExtensions;
}

export interface ServiceDocumentation {
  terms_of_service?: string;
  contact?: ContactDocumentation;
  license?: LicenseDocumentation;
  tags: TagDocumentation[];
  external_docs?: ExternalDocumentation;
  extensions?: NamespacedExtensions;
}

export interface ContactDocumentation {
  name?: string;
  url?: string;
  email?: string;
}

export interface LicenseDocumentation {
  name?: string;
  identifier?: string;
  url?: string;
}

export interface TagDocumentation {
  name: string;
  summary?: string;
  parent?: string;
  kind?: string;
  description?: string;
  external_docs?: ExternalDocumentation;
}

export interface Server {
  url: string;
  name?: string;
  description?: string;
  environment?: string;
  is_default?: boolean;
  variables?: ServerVariable[];
}

export interface ServerVariable {
  name: string;
  default?: string;
  enum?: string[];
  required: boolean;
}

export interface Schema {
  $ref?: string;
  type?: string;
  format?: string; // e.g. "binary" for file downloads
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  example?: unknown;
  items?: SchemaProperty;
  additionalProperties?: SchemaProperty;
  allOf?: SchemaProperty[];
  anyOf?: SchemaProperty[];
  oneOf?: SchemaProperty[];
  discriminator?: { mapping?: Record<string, string> };
}

export interface SchemaProperty {
  $ref?: string;
  type?: string;
  description?: string;
  enum?: string[];
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
  additionalProperties?: SchemaProperty;
  allOf?: SchemaProperty[];
  anyOf?: SchemaProperty[];
  oneOf?: SchemaProperty[];
  discriminator?: { mapping?: Record<string, string> };
}


// --- types/sdk_config.ts ---
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


// --- types/http_types.ts ---
export interface HttpRequest {
  method: string;
  operationId: string;
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  responseType?: 'json' | 'arraybuffer' | 'sse' | 'auto';
  environment?: string;
  idempotencyKey?: string;
  // Invocation pagination is a bound, never a provider continuation strategy.
  paginationMaxPages?: number;
  // Passthrough auth resolved by an AuthProvider.apply() call (via setAuth()).
  // This — not `headers` — is what actually reaches the Engine: the SDK is a
  // gRPC client, so header mutations never cross the wire. Keyed to match what
  // the Go dispatcher's applyAuth/applyHTTPAuth/applyAPIKey/applyOAuth expect
  // (e.g. "Authorization", "<auth>_username", "<auth>_password",
  // "<auth>_cert", "<auth>_key", or the apiKey's KeyName).
  credentials?: Record<string, string>;
}

export interface FusedPaginationOptions {
  maxPages: number;
}

export interface FusedExecutionOptions {
  endUserRef?: string;
  authType?: 'basic' | 'bearer' | 'api_key' | 'oauth' | 'oidc' | 'mtls';
  authName?: string;
  resourceId?: string;
  pagination?: FusedPaginationOptions;
}

export type ResponseMediaFamily = 'sse' | 'json' | 'binary' | 'xml' | 'text' | 'other' | 'unknown';

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
  ok: boolean;
  mediaFamily: ResponseMediaFamily;
}

export class IntegrationError extends Error {
  constructor(
    public readonly integration: string,
    public readonly endpoint: string,
    public readonly statusCode: number,
    public readonly responseBody: unknown,
    message: string
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export class RateLimitError extends IntegrationError {
  public readonly retryAfterMs?: number;
  constructor(integration: string, endpoint: string, retryAfterMs?: number) {
    super(integration, endpoint, 429, null, `Rate limit exceeded for ${integration}`);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class AuthError extends IntegrationError {
  constructor(integration: string, endpoint: string) {
    super(integration, endpoint, 401, null, `Authentication failed for ${integration}`);
    this.name = 'AuthError';
  }
}


// --- http/base_client.ts ---

// Auto-generated. Do not edit manually.
// Powered by Fused - The integration layer for teams that want control.
// Custom SDKs, native webhooks, and MCP servers from services you actually use.
// Learn more at: https://usefused.com

const protoPath = path.join(__dirname, 'engine.proto');
const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const enginePkg = grpc.loadPackageDefinition(packageDefinition) as any;
export const EngineService = enginePkg.engine.v1.EngineService;

export class EngineEnvironmentError extends Error {
  constructor(
    public readonly code: string,
    public readonly requested?: string,
    public readonly available: string[] = []
  ) {
    super(`${code}${requested ? `: ${requested}` : ''}`);
    this.name = 'EngineEnvironmentError';
  }
}

// ReconnectRequiredError tells application code which Engine connect session
// to start while keeping OAuth credentials and provider responses server-side.
export class ReconnectRequiredError extends Error {
  // The constructor maps the stable wire contract to idiomatic SDK fields so
  // callers do not need to parse Engine JSON or retain request internals.
  constructor(
    public readonly bucketId: string,
    public readonly serviceId: string,
    public readonly endUserRef: string,
    public readonly connectionId: string,
    public readonly reason: string
  ) {
    super(`Reconnect required for service ${serviceId}`);
    this.name = 'ReconnectRequiredError';
  }
}

export class ExecutionTimeoutError extends Error {
  public readonly code = 'execution_timeout';

  constructor(
    public readonly integration: string,
    public readonly endpoint: string,
    public readonly timeoutMs: number
  ) {
    super(`Execution timed out after ${timeoutMs}ms for ${integration}.${endpoint}`);
    this.name = 'ExecutionTimeoutError';
  }
}

function nonEmptyString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function mapEngineDecision(
  parsed: any,
  integration: string,
  endpoint: string,
  timeoutMs: number
): Error | undefined {
  if (parsed?.code === 'reconnect_required') {
    return new ReconnectRequiredError(
      nonEmptyString(parsed.bucket_id),
      nonEmptyString(parsed.service_id),
      nonEmptyString(parsed.end_user_ref),
      nonEmptyString(parsed.connection_id),
      nonEmptyString(parsed.reason, 'refresh_token_rejected')
    );
  }
  if (parsed?.code === 'environment_not_supported' || parsed?.code === 'default_environment_not_configured') {
    return new EngineEnvironmentError(parsed.code, parsed.requested, stringList(parsed.available));
  }
  if (parsed?.code === 'execution_timeout') {
    return new ExecutionTimeoutError(integration, endpoint, Number(parsed.timeout_ms) || timeoutMs);
  }
  return undefined;
}

// parseEngineError converts documented Engine decisions to typed errors;
// unknown payloads remain ordinary errors with their original message.
export function parseEngineError(
  message: string,
  integration = 'Fused Engine',
  endpoint = 'execute',
  timeoutMs = 0
): Error {
  try {
    const parsed = JSON.parse(message);
    // Engine decisions are mapped in one bounded helper so adding a new wire
    // decision cannot make parsing and fallback behavior diverge.
    const decision = mapEngineDecision(parsed, integration, endpoint, timeoutMs);
    if (decision) return decision;
  } catch {
    // Malformed or ordinary Engine errors keep their original message.
  }
  return new Error(message);
}

function normaliseGRPCError(
  error: any,
  integration: string,
  endpoint: string,
  timeoutMs: number
): Error {
  if (error instanceof ExecutionTimeoutError) return error;
  if (error?.code === grpc.status.DEADLINE_EXCEEDED) {
    return new ExecutionTimeoutError(integration, endpoint, timeoutMs);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function requireSDKExecutionToken(token?: string): string {
  // A License Key belongs to Engine-to-Registry traffic, so SDK execution must
  // fail locally instead of borrowing an ambient management credential.
  if (!token || token.trim() === '') {
    throw new Error('Fused SDK execution token is required in config.token');
  }
  return token;
}

export class BaseClient {
  // The gRPC stub is injected by FusedSDK, which owns the single shared channel.
  // All services on one FusedSDK instance multiplex over that one HTTP/2 connection.
  private appId: string;
  private token: string;
  // Per-request passthrough credentials forwarded to the Engine in-flight only.
  private credentials: Record<string, string>;
  // Handshake state: the Engine loads this SDK's scope + Fused objects into its
  // connection-scoped cache on Connect (AD-7). One handshake per shared channel.
  private connected = false;
  private connectPromise?: Promise<void>;
  private readonly tracer: ReturnType<typeof trace.getTracer>;

  constructor(
    private readonly integrationName: string,
    private readonly client: any,
    private readonly timeoutMs: number,
    private readonly debug: boolean,
    private readonly defaultHeaders: Record<string, string> = {},
    appId: string,
    token?: string,
    credentials?: Record<string, string>,
    private readonly environment?: string,
    private readonly streamIdleTimeoutMs?: number,
    private readonly maxStreamDurationMs?: number
  ) {
    this.tracer = trace.getTracer(integrationName);
    this.appId = appId;
    this.token = requireSDKExecutionToken(token);
    this.credentials = credentials || {};
  }

  /**
   * Performs the Engine handshake once per shared channel. Concurrent callers
   * share one in-flight handshake via connectPromise.
   */
  private ensureConnected(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const metadata = new grpc.Metadata();
      metadata.add('x-api-key', this.token);
      metadata.add('x-app-id', this.appId);
      this.client.Connect({}, metadata, { deadline: Date.now() + this.timeoutMs }, (err: any) => {
        if (err) {
          this.connectPromise = undefined;
          return reject(err);
        }
        this.connected = true;
        resolve();
      });
    });
    return this.connectPromise;
  }

  /**
   * Executes an integration endpoint on the Engine over gRPC.
   */
  async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    // Condition: SSE endpoints hand back a live async iterable instead of a
    // buffered value; it uses the same single Execute call shape as buffered requests.
    if (req.responseType === 'sse') {
      return this.requestStream<T>(req);
    }
    if (req.responseType === 'auto') {
      return this.requestAdaptive<T>(req);
    }

    const tracer = this.tracer;
    const spanName = `${this.integrationName}.${req.operationId}`;

    return tracer.startActiveSpan(spanName, async (span) => {
      // The SDK no longer builds provider URLs; operationId is the stable,
      // non-secret execution identifier the Engine actually resolves.
      span.setAttribute('tool.name', req.operationId);

      try {
        // Handshake once per channel before executing (AD-7). Reuses the
        // warm Engine-side cache on subsequent calls.
        await this.ensureConnected();
        const result = await this.executeOnce<T>(req);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return result;
      } catch (err: any) {
        const normalised = normaliseGRPCError(
          err,
          this.integrationName,
          req.operationId,
          this.timeoutMs
        );
        span.setStatus({ code: SpanStatusCode.ERROR, message: normalised.message });
        span.end();
        throw normalised;
      }
    });
  }

  /** Sends a single Execute RPC and collects the full streamed response. */
  private executeOnce<T>(req: HttpRequest): Promise<HttpResponse<T>> {
	const metadata = this.executeMetadata();
	const call = this.client.Execute(
	  this.buildExecuteReq(req), metadata, { deadline: Date.now() + this.timeoutMs }
	);
	const family = req.responseType === 'arraybuffer' ? 'binary' : 'unknown';
	return this.collectExecuteCall<T>(call, req, 0, family);
  }

  private collectExecuteCall<T>(call: any, req: HttpRequest, statusHint: number, family: ResponseMediaFamily, resumeAfterAttach = false): Promise<HttpResponse<T>> {
    return new Promise<HttpResponse<T>>((resolve, reject) => {
	  const chunks: Buffer[] = [];
	  let status = statusHint;
      call.on('data', (response: any) => {
        if (response.error) {
          return reject(parseEngineError(
            response.error,
            this.integrationName,
            req.operationId,
            this.timeoutMs
          ));
        }
		if (response.result?.length) chunks.push(Buffer.from(response.result));
        if (response.status_code) status = Number(response.status_code);
      });

      call.on('end', () => {
		const parsedBody = this.parseBufferedBody(Buffer.concat(chunks), family);
        const responseStatus = status || 500;
        resolve({
          status: responseStatus,
          headers: {},
		  body: parsedBody as T, mediaFamily: family,
		  ok: responseStatus >= 200 && responseStatus < 300,
        });
      });

      call.on('error', (err: any) => reject(err));
	  if (resumeAfterAttach) call.resume();
    });
  }

  private parseBufferedBody(data: Buffer, family: ResponseMediaFamily): unknown {
    if (family === 'binary') return data;
    const text = data.toString('utf8');
    if (family !== 'json' && family !== 'unknown') return text;
    try { return JSON.parse(text); } catch { return text; }
  }

  private executeMetadata(): grpc.Metadata {
    const metadata = new grpc.Metadata();
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    for (const [key, value] of Object.entries(carrier)) metadata.add(key, value);
    metadata.add('x-api-key', this.token);
    metadata.add('x-app-id', this.appId);
    return metadata;
  }

  private async requestAdaptive<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    await this.ensureConnected();
    const call = this.client.Execute(
      this.buildExecuteReq(req), this.executeMetadata(), { deadline: Date.now() + this.timeoutMs }
    );
    const contract = await this.waitForResponseContract(call, req.operationId);
    if (contract.family === 'sse' && contract.status >= 200 && contract.status < 300) {
      return { status: contract.status, headers: {}, mediaFamily: 'sse', body: this.streamResponses<T>(call, req.operationId, true) as unknown as T, ok: true };
    }
    return this.collectExecuteCall<T>(call, req, contract.status, contract.family, true);
  }

  private waitForResponseContract(call: any, endpoint: string): Promise<{ status: number; family: ResponseMediaFamily }> {
    return new Promise((resolve, reject) => {
      const onMetadata = (metadata: grpc.Metadata) => {
        // Metadata and the first body frame can arrive in the same event-loop
        // turn. Pausing here closes that handoff gap until the selected body
        // consumer has attached, preserving the first provider chunk exactly.
        call.pause();
        cleanup();
        resolve({ status: Number(metadata.get('fused-response-status')[0] || 0), family: boundedResponseFamily(metadata.get('fused-response-media-family')[0]) });
      };
      const onData = (response: any) => {
        cleanup();
        const error = response.error || 'Engine response contract signal missing';
        reject(parseEngineError(error, this.integrationName, endpoint, this.timeoutMs));
      };
      const onError = (error: any) => { cleanup(); reject(error); };
      const cleanup = () => {
        call.removeListener('metadata', onMetadata);
        call.removeListener('data', onData);
        call.removeListener('error', onError);
      };
      call.once('metadata', onMetadata);
      call.once('data', onData);
      call.once('error', onError);
    });
  }

  /** Builds the wire ExecuteRequest payload shared by the buffered and streaming paths. */
  private buildExecuteReq(req: HttpRequest): Record<string, unknown> {
    const params = Buffer.from(JSON.stringify(req.body || {}));
    return {
      // Proto keeps the older endpoint_name field; the SDK contract treats it
      // as the registry operationId so config, docs, and execution use one term.
      endpoint_name: req.operationId,
      params,
      idempotency_key: this.ensureIdempotencyKey(req),
      request_body_hash: this.requestBodyHash(params),
      // Omission must stay distinct from a supplied zero that Engine rejects.
      ...(req.paginationMaxPages === undefined ? {} : { pagination: { max_pages: req.paginationMaxPages } }),
      // Passthrough auth: forwarded to the Engine and used in-flight only.
      // `this.credentials` is the constructor-time default; `req.credentials`
      // (populated per-call by setAuth()'s AuthProvider.apply() chain) takes
      // precedence since it's the more specific, explicit configuration.
      credentials: { ...this.credentials, ...req.credentials },
      environment: req.environment || this.environment
    };
  }

  private ensureIdempotencyKey(req: HttpRequest): string {
    req.idempotencyKey ||= randomUUID();
    return req.idempotencyKey;
  }

  private requestBodyHash(params: Buffer): string {
    return createHash('sha256').update(params).digest('hex');
  }

  /**
   * Opens the Execute stream for an SSE endpoint and resolves immediately with
   * an async-iterable body — the Engine parses vendor SSE server-side (moved
   * out of the SDK) and sends one already-decoded event per stream chunk; this
   * just hands each chunk to the caller as it arrives instead of buffering the
   * whole response. Iteration errors (including a mid-stream Engine error)
   * surface as a thrown error from the generator, not from this method.
   */
  private async requestStream<T>(req: HttpRequest): Promise<HttpResponse<T>> {
	const response = await this.requestAdaptive<T>(req);
	if (response.ok && response.mediaFamily === 'sse') return response;
	const detail = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
	throw parseEngineError(detail || `Provider returned status ${response.status}`, this.integrationName, req.operationId, this.timeoutMs);
  }

  private async *streamResponses<T>(call: any, endpoint: string, resumeAfterAttach = false): AsyncGenerator<T> {
    const iterator = (call as AsyncIterable<any>)[Symbol.asyncIterator]();
	if (resumeAfterAttach) call.resume();
    const startedAt = Date.now();
    let firstResponse = true;
    let completed = false;
    try {
      while (true) {
        const waitMs = this.streamWaitTimeoutMs(firstResponse, startedAt);
        const next = await this.nextStreamResponse(iterator, call, waitMs, endpoint);
        if (next.done) {
          completed = true;
          return;
        }
        firstResponse = false;
        const decoded = this.decodeStreamResponse<T>(next.value, endpoint, waitMs);
        if (decoded.empty) continue;
        yield decoded.value;
      }
    } catch (error) {
      throw normaliseGRPCError(
        error,
        this.integrationName,
        endpoint,
        this.streamWaitTimeoutMs(firstResponse, startedAt) ?? this.timeoutMs
      );
    } finally {
      // A consumer can stop iterating before the provider closes the stream.
      // Canceling here prevents the Engine and provider connection leaking.
      if (!completed) call.cancel();
    }
  }

  private decodeStreamResponse<T>(response: any, endpoint: string, waitMs?: number): { empty: true } | { empty: false; value: T } {
    if (response.error) {
      throw parseEngineError(
        response.error,
        this.integrationName,
        endpoint,
        waitMs ?? this.timeoutMs
      );
    }
    if (!response.result || response.result.length === 0) return { empty: true };
    const text = Buffer.isBuffer(response.result)
      ? response.result.toString('utf8')
      : String(response.result);
    try {
      return { empty: false, value: JSON.parse(text) as T };
    } catch {
      return { empty: false, value: text as unknown as T };
    }
  }

  private streamWaitTimeoutMs(firstResponse: boolean, startedAt: number): number | undefined {
    const candidates: number[] = [];
    if (firstResponse && this.timeoutMs > 0) candidates.push(this.timeoutMs);
    if (!firstResponse && this.streamIdleTimeoutMs && this.streamIdleTimeoutMs > 0) {
      candidates.push(this.streamIdleTimeoutMs);
    }
    if (this.maxStreamDurationMs && this.maxStreamDurationMs > 0) {
      candidates.push(this.maxStreamDurationMs - (Date.now() - startedAt));
    }
    return candidates.length > 0 ? Math.min(...candidates) : undefined;
  }

  private nextStreamResponse(
    iterator: AsyncIterator<any>,
    call: any,
    waitMs: number | undefined,
    endpoint: string
  ): Promise<IteratorResult<any>> {
    if (waitMs === undefined) return iterator.next();
    if (waitMs <= 0) {
      call.cancel();
      return Promise.reject(new ExecutionTimeoutError(this.integrationName, endpoint, 1));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        call.cancel();
        reject(new ExecutionTimeoutError(this.integrationName, endpoint, waitMs));
      }, waitMs);
      iterator.next().then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
}

function boundedResponseFamily(value: unknown): ResponseMediaFamily {
  const family = String(value || 'unknown') as ResponseMediaFamily;
  return ['sse', 'json', 'binary', 'xml', 'text', 'other', 'unknown'].includes(family) ? family : 'unknown';
}

export function buildGraphQLSelection(fieldMap: Record<string, string>, fields?: string[]): string {
  if (fields && fields.length > 0) {
    return fields.map(f => fieldMap[f]).filter(Boolean).join('\n');
  }
  return Object.values(fieldMap).join('\n');
}


// --- http/error_normaliser.ts ---

export function normaliseError(integration: string, endpoint: string, response: HttpResponse): never {
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(integration, endpoint);
  }

  if (response.status === 429) {
    let retryAfterMs: number | undefined;
    const headers = response.headers || {};
    // Check case-insensitive
    const retryAfterKey = Object.keys(headers).find(k => k.toLowerCase() === 'retry-after');
    if (retryAfterKey) {
      const retryAfter = headers[retryAfterKey];
      const parsed = parseInt(retryAfter, 10);
      if (!isNaN(parsed)) {
        retryAfterMs = parsed * 1000;
      }
    }
    throw new RateLimitError(integration, endpoint, retryAfterMs);
  }

  throw new IntegrationError(
    integration,
    endpoint,
    response.status,
    response.body,
    `Integration ${integration} returned ${response.status} for ${endpoint}`
  );
}


// --- http/response_parser.ts ---

export function parseResponse<T>(response: HttpResponse, schema: Schema): T {
  if (schema.type === 'object' && schema.required && typeof response.body === 'object' && response.body !== null) {
    const bodyObj = response.body as Record<string, unknown>;
    for (const reqField of schema.required) {
      if (!(reqField in bodyObj)) {
        throw new Error(`Response validation failed: missing required field "${reqField}"`);
      }
    }
  }
  return response.body as T;
}


// --- auth/auth_provider.ts ---

export interface AuthProvider {
  apply(req: HttpRequest): Promise<HttpRequest>;
}


// --- auth/http_provider.ts ---

export class HttpProvider implements AuthProvider {
  constructor(
    private readonly scheme: string,
    private readonly tokenOrUsername: string,
    private readonly password?: string,
    private readonly credentialName?: string
  ) {}

  async apply(req: HttpRequest): Promise<HttpRequest> {
    const updated = { ...req };
    // The Engine is in charge of auth formatting and injection. We only pass the
    // raw credential values through the `credentials` map; the Go dispatcher's
    // applyHTTPAuth reads these keys and builds the outbound Authorization
    // header. Keeping secrets out of `headers` prevents accidental leakage if
    // the request object is logged or serialized.
    if (this.scheme.toLowerCase() === 'basic') {
      const baseName = this.credentialName ? `${this.credentialName}_` : '';
      updated.credentials = {
        ...updated.credentials,
        [`${baseName}username`]: this.tokenOrUsername,
        [`${baseName}password`]: this.password || '',
      };
    } else {
      // Named security schemes must use the same credential slot as the Engine
      // dispatcher; otherwise valid SDK passthrough tokens are ignored.
      const key = this.credentialName || 'Authorization';
      updated.credentials = { ...updated.credentials, [key]: this.tokenOrUsername };
    }
    return updated;
  }
}
