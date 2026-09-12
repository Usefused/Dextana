import { loadCatalog } from './load-catalog.mjs';
import { mkdir, chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { loadBillingSDK } from './billing-sdk.mjs';
import { StripeRegistration, listenForStripe } from './stripe-webhooks.mjs';
import { resolve, join } from 'node:path';
import { Database } from './database.mjs';
import { Integrations } from './service.mjs';
import { Billing, Mail } from './billing.mjs';
import { Fused } from './fused.mjs';
import { validateOrigin } from './core.mjs';
import { serverFor } from './http.mjs';
const required = (name) => {
  if (!process.env[name]) throw new Error(`${name} is required.`);
  return process.env[name];
};
const local = process.argv.includes('--local');
const directory = resolve(process.env.DATA_DIR ?? 'var');
await mkdir(directory, { recursive: true, mode: 0o700 });
const cliHome = await mkdtemp(join(directory, '.cli-config-')); // Fresh empty config prevents saved-login precedence.
const config = {
  origin: validateOrigin(
    process.env.PUBLIC_ORIGIN || (local ? 'http://127.0.0.1:8787' : required('PUBLIC_ORIGIN')),
  ),
  engine: 'https://fused.run.usefused.com',
  // Local catalog browsing uses the verified CLI login unless a Dext-specific service key is supplied.
  apiKey: local ? process.env.DEXT_FUSED_CONTROL_KEY : required('FUSED_API_KEY'),
  bucketId: local ? process.env.FUSED_BUCKET_ID : required('FUSED_BUCKET_ID'),
  cli: process.env.FUSED_CLI_PATH,
  cliHome,
  sdkModule: process.env.FUSED_BILLING_SDK_MODULE,
  sdkToken: process.env.FUSED_BILLING_SDK_TOKEN,
  grpcUrl: process.env.FUSED_ENGINE_GRPC_URL,
  webhookUrl: process.env.FUSED_STRIPE_WEBHOOK_URL,
  receiverName: process.env.FUSED_RECEIVER_NAME || 'dext-integrations-billing',
  adminToken: process.env.ADMIN_TOKEN,
  stripeLive: process.env.STRIPE_LIVE === 'true',
  mailKey: process.env.RESEND_API_KEY,
  mailFrom: process.env.MAIL_FROM,
};
async function localSecret(name) {
  const file = join(directory, name);
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const value = randomBytes(32).toString('hex');
    await writeFile(file, value, { mode: 0o600, flag: 'wx' });
    return value;
  }
}
if (
  local &&
  (!['127.0.0.1', 'localhost'].includes(new URL(config.origin).hostname) ||
    !['127.0.0.1', 'localhost'].includes(process.env.HOST || '127.0.0.1'))
)
  throw new Error('Local mode must bind to loopback with a loopback public origin.');
if (local && !config.adminToken) config.adminToken = await localSecret('admin-token');
if (!local) {
  for (const name of [
    'FUSED_BILLING_SDK_MODULE',
    'FUSED_BILLING_SDK_TOKEN',
    'FUSED_ENGINE_GRPC_URL',
    'FUSED_STRIPE_WEBHOOK_URL',
    'ADMIN_TOKEN',
    'RESEND_API_KEY',
    'MAIL_FROM',
  ])
    required(name);
}
const encryptionMaterial =
  process.env.TOKEN_ENCRYPTION_KEY ||
  (local ? await localSecret('encryption-key') : required('TOKEN_ENCRYPTION_KEY'));
const encryptionKey = Buffer.from(encryptionMaterial, 'hex');
if (!/^[a-fA-F0-9]{64}$/.test(encryptionMaterial))
  throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters.');
const catalog = await loadCatalog(config);
const { sdk, module: sdkModule } = await loadBillingSDK(config);
if (
  catalog.mcpId !== '323aa26c-ea7b-45eb-87f6-b7b6ff01aa75' ||
  new URL(catalog.mcpUrl).origin !== config.engine
)
  throw new Error('Unexpected Fused catalog identity.');
const database = new Database(join(directory, 'integrations.sqlite'));
await chmod(join(directory, 'integrations.sqlite'), 0o600);
const service = new Integrations(
  database,
  catalog,
  new Billing(config, sdk),
  new Fused(config, catalog),
  new Mail(config),
  encryptionKey,
);
service.stripeRegistration = new StripeRegistration(
  database,
  service.billing,
  config,
  encryptionKey,
  (value) => service.fused.storeStripeSigningSecret(value),
);
const receiver = sdkModule ? listenForStripe(sdkModule, config, service) : undefined;
let maintaining = false;
const maintain = async () => {
  if (maintaining) return;
  maintaining = true;
  try {
    await service.maintain();
  } finally {
    maintaining = false;
  }
};
await maintain();
const interval = setInterval(() => void maintain(), 30_000);
let refreshing = false;
const refresh = setInterval(async () => {
  if (refreshing) return;
  refreshing = true;
  try {
    const next = await loadCatalog(config);
    service.catalog = next;
    service.fused.catalog = next;
  } catch {
    console.error('Catalog refresh failed; keeping the last verified catalog.');
  } finally {
    refreshing = false;
  }
}, 300_000);
const server = serverFor(service, config);
server.listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1', () =>
  console.log(
    `Dext Integrations is listening at ${config.origin}${sdk ? '' : ' (billing SDK awaits configuration)'}.`,
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    receiver?.close();
    sdk?.close();
    clearInterval(interval);
    clearInterval(refresh);
    server.close(() => process.exit(0));
  });
