import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateOrigin } from './core.mjs';
const origin = validateOrigin(process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:8787');
const local = ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname);
const token =
  process.env.ADMIN_TOKEN ||
  (local
    ? (await readFile(resolve(process.env.DATA_DIR || 'var', 'admin-token'), 'utf8')).trim()
    : undefined);
if (!token) throw new Error('ADMIN_TOKEN is required.');
const action = process.argv.includes('--bootstrap') ? 'webhook-bootstrap' : 'webhook-registration';
const response = await fetch(`${origin}/v1/admin/stripe/${action}`, {
  method: 'POST',
  redirect: 'error',
  signal: AbortSignal.timeout(60_000),
  headers: { authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: '{}',
});
const result = await response.json();
if (!response.ok) {
  console.error(result.error || 'Webhook registration failed.');
  process.exitCode = 1;
} else console.log(JSON.stringify(result, null, 2));
