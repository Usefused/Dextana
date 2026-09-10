import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestHandler } from '@remix-run/node';
import * as build from '../build/server/index.js';

const handler = createRequestHandler(build, 'production');

test('the production homepage renders content and download destinations without JavaScript', async () => {
  const response = await handler(new Request('http://localhost/'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  for (const content of ['Research, organise, create', 'macOS', 'Windows', 'Linux', 'Choose your AI', 'notarized', 'No GitHub account required']) assert.ok(html.includes(content), `Missing ${content}`);
  for (const anchor of ['main', 'possibilities', 'how-it-works', 'download']) assert.ok(html.includes(`id="${anchor}"`), `Missing navigation target ${anchor}`);
  for (const file of ['Dextana-mac-arm64.dmg', 'Dextana-win-x64.exe', 'Dextana-linux-x86_64.AppImage']) assert.ok(html.includes(`https://github.com/Usefused/Dextana/releases/download/desktop-alpha/${file}`), `Missing public installer ${file}`);
  assert.doesNotMatch(html, /actions\/runs\/|artifacts\/|package has expired/);
  assert.ok(html.includes('Dextana No-Resale License'));
  assert.ok(html.includes('Reselling the app or its installer packages requires written permission'));
  assert.doesNotMatch(html, /predate|original MIT|past licen[cs]/);
  assert.doesNotMatch(html, /creativeJoe007|OPEN-SOURCE ALPHA|MIT license/);
  assert.doesNotMatch(html, /actions\/workflows|successful build run|Choose the Dextana-/);
  assert.doesNotMatch(html, /electron|ipcRenderer|localhost:11434/);
});

test('unknown URLs return a helpful 404 instead of a successful empty page', async () => {
  const response = await handler(new Request('http://localhost/does-not-exist'));
  assert.equal(response.status, 404);
  assert.match(await response.text(), /A little off track/);
});

// Follow actual internal links so guide URLs and fragment targets cannot silently break.
test('homepage and guide links resolve to existing pages and sections', async () => {
  const pages = new Map();
  for (const path of ['/', '/guide']) pages.set(path, await (await handler(new Request(`http://localhost${path}`))).text());
  for (const [path, html] of pages) {
    for (const [, href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
      const url = new URL(href.replaceAll('&amp;', '&'), `http://localhost${path}`);
      if (url.origin !== 'http://localhost') continue;
      if (url.pathname === '/license.txt') {
        const { readFile } = await import('node:fs/promises');
        assert.match(await readFile('public/license.txt', 'utf8'), /Dextana/);
        continue;
      }
      if (!pages.has(url.pathname)) {
        const response = await handler(new Request(url));
        assert.equal(response.status, 200, `Broken link: ${href}`);
        pages.set(url.pathname, await response.text());
      }
      if (url.hash) assert.ok(pages.get(url.pathname).includes(`id="${url.hash.slice(1)}"`), `Missing section: ${href}`);
    }
  }
});
