import { describe, it, expect } from 'vitest';
import { LoginTransfer, loginMaterial, loginOrigin } from '../../src/main/session-transfer';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const origin = 'https://app.example.com';
const cookie = {
  name: 'sid',
  value: 'synthetic',
  domain: 'app.example.com',
  path: '/',
  hostOnly: true,
  secure: true,
  httpOnly: true,
  sameSite: 'lax',
};
const material = (extras = {}) => ({
  origin,
  approved: true,
  selected: ['cookies'],
  cookies: [cookie],
  ...extras,
});
describe('website login approval boundary', () => {
  it('keeps cookie attributes and original expiry without imposing a login lifetime', () => {
    const expirationDate = Date.now() / 1000 + 86400;
    expect(
      loginMaterial(material({ cookies: [{ ...cookie, expirationDate }] }), origin).cookies[0],
    ).toEqual({
      url: origin + '/',
      name: 'sid',
      value: 'synthetic',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      expirationDate,
    });
    expect(loginMaterial(material(), origin).cookies[0]).not.toHaveProperty('expirationDate');
  });
  it.each([
    { approved: false },
    { origin: 'https://other.example.com' },
    { selected: [] },
    { localStorage: [{ name: 'token', value: 'not-approved' }] },
    { selected: ['cookies', 'cookies'] },
    { cookies: [{ ...cookie, domain: 'other.example.com' }] },
    { cookies: [{ ...cookie, partitionKey: {} }] },
    { cookies: [cookie, cookie] },
  ])('rejects invalid scope or missing approval: %j', (extras) => {
    expect(() => loginMaterial(material(extras), origin)).toThrow('Invalid or unapproved');
  });
  it('accepts separately selected storage and rejects insecure remote origins', () => {
    expect(
      loginMaterial(
        material({
          selected: ['localStorage', 'sessionStorage'],
          cookies: [],
          localStorage: [{ name: '__proto__', value: 'literal' }],
          sessionStorage: [{ name: 'login', value: 'value' }],
        }),
        origin,
      ).localStorage,
    ).toEqual([{ name: '__proto__', value: 'literal' }]);
    expect(() => loginOrigin('http://example.com')).toThrow();
    expect(loginOrigin('http://127.0.0.1:9876/login')).toBe('http://127.0.0.1:9876');
  });
  it('opens an explicitly approved source site without mixing its storage origin with the login provider', () => {
    const source = 'https://mail.google.com';
    const payload = material({
      origin: source,
      sourceUrl: source + '/mail/u/0/',
      openSourceSite: true,
      selected: ['localStorage'],
      cookies: [],
      localStorage: [{ name: 'login', value: 'synthetic' }],
    });
    const imported = loginMaterial(payload, 'https://accounts.google.com');
    expect(imported.origin).toBe(source);
    expect(imported.sourceUrl).toBe(source + '/mail/u/0/');
    expect(() =>
      loginMaterial({ ...payload, openSourceSite: false }, 'https://accounts.google.com'),
    ).toThrow();
    expect(() =>
      loginMaterial(
        { ...payload, sourceUrl: 'https://unrelated.example/' },
        'https://accounts.google.com',
      ),
    ).toThrow();
    expect(() =>
      loginMaterial(
        { ...payload, sourceUrl: source + '/?token=private' },
        'https://accounts.google.com',
      ),
    ).toThrow();
    expect(() =>
      loginMaterial(
        {
          ...payload,
          selected: ['cookies'],
          localStorage: [],
          cookies: [{ ...cookie, domain: 'accounts.google.com' }],
        },
        'https://accounts.google.com',
      ),
    ).toThrow();
  });
  it('requires a local connection token, rejects websites, and prevents simultaneous replays', async () => {
    const server = new LoginTransfer();
    let installed = 0;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entry = await server.begin(origin, 'Test chat', async () => {
      installed++;
      await waiting;
    });
    const [port, token] = entry.code.split('.');
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Origin: `chrome-extension://${'a'.repeat(32)}`,
    };
    try {
      expect(
        (await fetch(base + '/request', { headers: { ...headers, Origin: origin } })).status,
      ).toBe(403);
      expect((await fetch(base + '/request', { headers })).status).toBe(200);
      expect(
        (await fetch(base + '/request', { headers: { Authorization: `Bearer ${token}` } })).status,
      ).toBe(200);
      expect(
        (
          await fetch(base + '/import', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(material()),
          })
        ).status,
      ).toBe(403);
      const first = fetch(base + '/import', {
        method: 'POST',
        headers,
        body: JSON.stringify(material()),
      });
      await expect.poll(() => installed).toBe(1);
      expect(
        (
          await fetch(base + '/import', {
            method: 'POST',
            headers,
            body: JSON.stringify(material()),
          })
        ).status,
      ).toBe(409);
      expect(() => server.cancel(entry.id)).toThrow('Wait');
      release();
      expect((await first).status).toBe(200);
      expect(server.status(entry.id).state).toBe('completed');
      expect(installed).toBe(1);
    } finally {
      release();
      server.close();
    }
  });
});

it('extension capture reads only approved categories and checks source navigation', async () => {
  const scope: any = { TextEncoder, URL };
  runInNewContext(readFileSync('browser-extension/transfer.js', 'utf8'), scope);
  const tab = { id: 7, url: origin + '/account', incognito: false };
  let cookieReads = 0;
  const chrome = {
    tabs: { get: async () => tab },
    cookies: {
      getAllCookieStores: async () => [{ id: 'profile', tabIds: [7] }],
      getAll: async (query: any) => {
        expect(query).toEqual({ url: tab.url, storeId: 'profile' });
        cookieReads++;
        return [cookie];
      },
    },
  };
  const result = await scope.DextanaTransfer.capture(chrome, tab, ['cookies']);
  expect(cookieReads).toBe(1);
  expect(result.localStorage).toEqual([]);
  expect(result.cookies[0].httpOnly).toBe(true);
  await expect(
    scope.DextanaTransfer.capture(chrome, { ...tab, url: origin + '/old' }, ['cookies']),
  ).rejects.toThrow('changed');
  expect(cookieReads).toBe(1);
});
