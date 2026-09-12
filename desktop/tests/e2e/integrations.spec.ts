import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { test } from './fixture';
import catalog from '../../src/shared/integrations-catalog.json' with { type: 'json' };
let server: Server;
let subscribed = false;
let enabled: string[] = [];
let providerAccounts: {
  id: string;
  identityId: string;
  provider: string;
  label: string;
  selected: boolean;
}[] = [];
let availability = { subscribe: false, signIn: false };
let online = true;
const sessionToken = 'integration_test_session_token_with_48_characters_123';
const mcpUrl = 'https://fused.run.usefused.com/mcp/2afaa86d-b8e5-505c-a3f8-264934e60dc9';
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || '{}');
    res.setHeader('Content-Type', 'application/json');
    const account = () => ({
      username: 'alice',
      email: 'alice@example.com',
      subscribed,
      enabled,
      identities: [{ id: 'personal', label: 'Personal' }],
      providerAccounts,
      connected: false,
      revision: `scope-${enabled.join(',')}-${providerAccounts
        .map((item) => `${item.id}:${item.selected}`)
        .join(',')}`,
      mcpUrl,
    });
    if (req.url === '/v1/catalog') {
      if (!online) res.writeHead(503);
      return res.end(JSON.stringify({ ...catalog, availability }));
    }
    if (req.url === '/v1/register')
      return res.end(
        JSON.stringify({
          challengeId: 'challenge',
          checkoutUrl: 'https://checkout.stripe.com/c/pay/test',
        }),
      );
    if (req.url === '/v1/verify' && body.code === '12345678')
      return res.end(JSON.stringify({ sessionToken }));
    if (req.headers.authorization !== `Bearer ${sessionToken}`) {
      res.writeHead(401);
      return res.end(JSON.stringify({ error: 'Sign in.' }));
    }
    if (req.url === '/v1/account') return res.end(JSON.stringify(account()));
    if (req.url === '/v1/providers/enable') {
      enabled = body.enabled
        ? [...new Set([...enabled, body.provider])]
        : enabled.filter((id) => id !== body.provider);
      if (body.enabled && !providerAccounts.some((item) => item.provider === body.provider))
        providerAccounts.push({
          id: `${body.provider}-default`,
          identityId: 'personal',
          provider: body.provider,
          label: 'Default account',
          selected: true,
        });
      return res.end(JSON.stringify(account()));
    }
    if (req.url === '/v1/provider-accounts/select') {
      providerAccounts = providerAccounts.map((item) => ({
        ...item,
        selected: item.provider === body.provider ? item.id === body.accountId : item.selected,
      }));
      return res.end(JSON.stringify(account()));
    }
    if (req.url === '/v1/provider-accounts/add') {
      providerAccounts = providerAccounts.map((item) => ({
        ...item,
        selected: item.provider === body.provider ? false : item.selected,
      }));
      providerAccounts.push({
        id: `${body.provider}-${providerAccounts.length}`,
        identityId: 'personal',
        provider: body.provider,
        label: body.label,
        selected: true,
      });
      return res.end(
        JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/auth?state=added' }),
      );
    }
    if (req.url === '/v1/providers/connect')
      return res.end(
        JSON.stringify({ url: 'https://accounts.google.com/o/oauth2/auth?state=test' }),
      );
    if (req.url === '/v1/credentials')
      return res.end(
        JSON.stringify({
          token: 'private-fixed-user-token',
          tokenId: 'test-token',
          expiresAt: Date.now() + 900000,
          url: mcpUrl,
        }),
      );
    if (req.url === '/v1/logout') return res.end('{}');
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.DEXT_INTEGRATIONS_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  delete process.env.DEXT_INTEGRATIONS_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test('Settings catalog, subscription modal, OAuth and secure account persistence', async ({
  workspace,
}, info) => {
  test.setTimeout(120000);
  const work = await workspace();
  const openSettings = async () => {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('button', { name: 'Integrations', exact: true })
      .click();
  };
  try {
    await work.app().evaluate(({ shell }) => {
      (globalThis as any).integrationOpenExternal = shell.openExternal;
      (globalThis as any).integrationLinks = [];
      shell.openExternal = async (url) => {
        (globalThis as any).integrationLinks.push(url);
      };
    });
    await openSettings();
    const panel = work.page.getByRole('region', { name: 'Dext Integrations', exact: true });
    await expect(panel.getByText('Gmail', { exact: true })).toBeVisible();
    await expect(
      panel.getByText(/Connected to Dext Integrations. Subscriptions are being set up/),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Subscribe · £10/month', exact: true }),
    ).toBeEnabled();
    await expect(panel.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    await panel.getByRole('button', { name: 'Subscribe · £10/month', exact: true }).click();
    const pending = work.page.getByRole('dialog', { name: 'Join Dext Integrations' });
    await expect(pending.getByText(/payment and email setup/i)).toBeVisible();
    await pending.getByRole('button', { name: 'Check availability' }).click();
    await expect(pending.getByRole('button', { name: 'Check availability' })).toBeEnabled();
    expect(await work.app().evaluate(() => (globalThis as any).integrationLinks)).toEqual([]);
    await pending.getByRole('button', { name: 'Close dialog' }).click();
    const search = panel.getByRole('searchbox', { name: 'Search integrations' });
    await search.fill('Calendar');
    await panel.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(panel.getByRole('region', { name: 'Google Calendar', exact: true })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Gmail', exact: true })).toHaveCount(0);
    await search.fill('Gmail');
    await search.press('Enter');
    await expect(panel.getByRole('region', { name: 'Gmail', exact: true })).toBeVisible();
    await expect(panel.getByRole('region', { name: 'Google Calendar', exact: true })).toHaveCount(
      0,
    );
    await search.fill('');
    await expect(panel.getByRole('region', { name: 'Google Calendar', exact: true })).toBeVisible();
    await work.page.screenshot({ path: info.outputPath('integrations-connected-setup.png') });
    online = false;
    await panel.getByRole('button', { name: 'Refresh status' }).click();
    await expect(panel.getByText(/Cannot reach Dext Integrations/)).toBeVisible();
    await expect(panel.getByText('Gmail', { exact: true })).toBeVisible();
    online = true;
    availability = { subscribe: true, signIn: true };
    await panel.getByRole('button', { name: 'Refresh status' }).click();
    await expect(
      panel.getByRole('button', { name: 'Subscribe · £10/month', exact: true }),
    ).toBeEnabled();
    await panel
      .getByRole('region', { name: 'Gmail', exact: true })
      .getByRole('button', { name: 'View operations' })
      .click();
    const detail = work.page.getByRole('dialog', { name: 'Gmail', exact: true });
    await expect(detail.getByText('Send an email', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Close dialog' }).click();
    await panel.getByRole('button', { name: 'Subscribe · £10/month', exact: true }).click();
    const form = work.page.getByRole('dialog', { name: 'Join Dext Integrations' });
    await form.getByLabel('Username', { exact: true }).fill('alice');
    await form.getByLabel('Email', { exact: true }).fill('alice@example.com');
    await work.page.screenshot({ path: info.outputPath('integrations-signup.png') });
    await form.getByRole('button', { name: 'Continue to Stripe · £10/month' }).click();
    const verification = work.page.getByRole('dialog', { name: 'Verify your email' });
    await verification.getByLabel('Verification code').fill('12345678');
    await verification.getByRole('button', { name: 'Verify email', exact: true }).click();
    await expect(panel.getByText('Welcome, alice')).toBeVisible();
    expect(await work.app().evaluate(() => (globalThis as any).integrationLinks)).toEqual([
      'https://checkout.stripe.com/c/pay/test',
    ]);
    subscribed = true;
    await panel.getByRole('button', { name: 'Refresh status' }).click();
    await expect(panel.getByText('Subscribed', { exact: true })).toBeVisible();
    const gmail = panel.getByRole('region', { name: 'Gmail', exact: true });
    await gmail.getByRole('checkbox', { name: 'Gmail', exact: true }).click();
    await expect(gmail.getByRole('checkbox', { name: 'Gmail', exact: true })).toBeChecked();
    await gmail.getByRole('button', { name: 'Connect account' }).click();
    await expect(panel.getByText(/Finish connecting in your browser/)).toBeVisible();
    await gmail.getByRole('button', { name: 'Add another account' }).click();
    const addAccount = work.page.getByRole('dialog', { name: 'Add Gmail account' });
    await addAccount.getByLabel('Account label').fill('Second Gmail');
    await addAccount.getByRole('button', { name: 'Continue to provider' }).click();
    await expect(addAccount).toHaveCount(0);
    await expect(gmail.getByRole('combobox', { name: 'Gmail account' })).toHaveValue('gmail-1');
    await expect(gmail.getByRole('option', { name: 'Default account' })).toHaveCount(1);
    await expect(gmail.getByRole('option', { name: 'Second Gmail' })).toHaveCount(1);
    await panel.getByRole('button', { name: 'Activate connections' }).click();
    await expect(
      panel.getByText('Your connected integrations are ready to use in chat.'),
    ).toBeVisible();
    const snapshot = await work.page.evaluate(() => window.dextana.snapshot());
    expect(snapshot.fusedIntegrations?.find((i) => i.id === 'dext-integrations')).toMatchObject({
      enabled: true,
      managed: 'dext',
    });
    expect(JSON.stringify(snapshot)).not.toContain('private-fixed-user-token');
    expect(JSON.stringify(snapshot)).not.toContain(sessionToken);
    expect(
      (await readFile(join(work.directory, 'integrations-session.enc'))).toString(),
    ).not.toContain(sessionToken);
    await work.page.screenshot({ path: info.outputPath('integrations-connected.png') });
    await work.app().evaluate(({ shell }) => {
      shell.openExternal = (globalThis as any).integrationOpenExternal;
    });
    await work.restart();
    await openSettings();
    await expect(work.page.getByText('Welcome, alice')).toBeVisible();
    await expect(work.page.getByRole('checkbox', { name: 'Gmail', exact: true })).toBeChecked();
    await work.page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(work.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(
      (await work.page.evaluate(() => window.dextana.snapshot())).fusedIntegrations?.find(
        (i) => i.id === 'dext-integrations',
      )?.enabled,
    ).toBe(false);
  } finally {
    await work.close();
  }
});
