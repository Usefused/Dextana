import { expect, it } from 'vitest';
import { loginAccess } from '../../src/extension/login-scope';

it('requests exact cookie hosts for the page and its registrable parents, including non-Secure cookies', () => {
  expect(loginAccess('https://myaccount.google.com/', ['cookies'])).toEqual({
    permissions: ['cookies'],
    origins: ['*://myaccount.google.com/*', '*://google.com/*'],
  });
  expect(loginAccess('https://login.app.example.co.uk/', ['cookies']).origins).toEqual([
    '*://login.app.example.co.uk/*',
    '*://app.example.co.uk/*',
    '*://example.co.uk/*',
  ]);
});

it('does not request hosting platforms, public suffixes, siblings or parent IP addresses', () => {
  expect(loginAccess('https://login.owner.github.io/', ['cookies']).origins).toEqual([
    '*://login.owner.github.io/*',
    '*://owner.github.io/*',
  ]);
  expect(loginAccess('https://127.0.0.1/', ['cookies']).origins).toEqual(['*://127.0.0.1/*']);
  expect(loginAccess('https://myaccount.google.com/', ['localStorage'])).toEqual({
    permissions: [],
    origins: ['https://myaccount.google.com/*'],
  });
});
