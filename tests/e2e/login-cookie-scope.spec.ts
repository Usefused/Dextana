import { chromium, expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loginAccess } from '../../src/extension/login-scope';

test('Chrome requires parent-domain access to capture shared login cookies for a subdomain', async () => {
  const origin = 'https://account.example.test';
  const collected: string[][] = [];
  for (const includeParents of [false, true]) {
    const extension = await mkdtemp(join(tmpdir(), 'dextana-cookie-scope-'));
    await cp(resolve('browser-extension'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    manifest.permissions.push('cookies');
    manifest.host_permissions.push(
      ...(includeParents ? loginAccess(origin, ['cookies']).origins : [origin + '/*']),
    );
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    const id = createHash('sha256')
      .update(Buffer.from(manifest.key, 'base64'))
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
    const browser = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      await browser.route(origin + '/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<title>Synthetic signed-in website</title>',
        }),
      );
      await browser.addCookies([
        {
          name: 'sharedSecure',
          value: 'synthetic',
          domain: '.example.test',
          path: '/',
          secure: true,
          httpOnly: true,
        },
        {
          name: 'sharedPlain',
          value: 'synthetic',
          domain: '.example.test',
          path: '/',
          secure: false,
          httpOnly: true,
        },
        { name: 'pageOnly', value: 'synthetic', url: origin, secure: true },
        {
          name: 'siblingOnly',
          value: 'must-not-copy',
          domain: 'other.example.test',
          path: '/',
          secure: true,
        },
        {
          name: 'unrelated',
          value: 'must-not-copy',
          domain: 'unrelated.test',
          path: '/',
          secure: true,
        },
      ]);
      const source = await browser.newPage();
      await source.goto(origin);
      const popup = await browser.newPage();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      const names = await popup.evaluate(async (site) => {
        const api = (window as any).chrome;
        const [tab] = await api.tabs.query({ url: site + '/*' });
        const result = await (window as any).DextanaTransfer.capture(api, tab, ['cookies']);
        return result.cookies.map((cookie: any) => cookie.name).sort();
      }, origin);
      collected.push(names);
    } finally {
      await browser.close();
      await rm(extension, { recursive: true, force: true });
    }
  }
  expect(collected[0]).toEqual(['pageOnly']);
  expect(collected[1]).toEqual(['pageOnly', 'sharedPlain', 'sharedSecure']);
});
