import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test, vi } from 'vitest';
import { browserResult } from '../../src/main/user-browser/protocol';

test('attached input returns the next observation and preserves form metadata at the bridge', async () => {
  const scope: any = { importScripts: vi.fn() };
  runInNewContext(readFileSync('browser-extension/control-actions.js', 'utf8'), scope);
  const snapshot = {
    url: 'https://example.com/done',
    forms: [{ ref: 'new:0', fields: ['new:1'], submit_refs: ['new:2'] }],
    elements: [{ ref: 'new:1', label: 'Email', actions: ['click', 'fill'] }],
  };
  scope.controlActive = vi.fn(async () => {});
  scope.controlCurrent = vi.fn(async () => ({ url: snapshot.url }));
  scope.controlInput = vi.fn(async () => {});
  scope.controlPage = vi.fn(async () => snapshot);
  const session = {};
  const args = { action: 'fill', ref: 'old:1', text: 'owner@example.com' };
  const result = await scope.controlExecute(session, {
    requestId: 'request',
    action: 'fill',
    arguments: args,
    expectedURL: 'https://example.com/form',
  });
  expect(scope.controlInput).toHaveBeenCalledExactlyOnceWith(session, args);
  expect(scope.controlPage).toHaveBeenCalledExactlyOnceWith(session, { action: 'read' });
  expect(browserResult(result, 'tab')).toMatchObject({
    forms: snapshot.forms,
    elements: snapshot.elements,
    tab_id: 'tab',
  });
});
