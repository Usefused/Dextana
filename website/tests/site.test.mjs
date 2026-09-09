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
  for (const content of ['Meet Dext.', 'macOS', 'Windows', 'Linux', 'Ollama', 'unsigned', 'installer packages directly']) assert.ok(html.includes(content), `Missing ${content}`);
  for (const anchor of ['main', 'possibilities', 'how-it-works', 'download']) assert.ok(html.includes(`id="${anchor}"`), `Missing navigation target ${anchor}`);
  for (const id of ['10080613868', '10080783730', '10080532414']) assert.ok(html.includes(`/actions/runs/34288516486/artifacts/${id}`), `Missing installer package ${id}`);
  assert.ok(html.includes('https://github.com/Usefused/Dextana/actions/runs/'));
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
