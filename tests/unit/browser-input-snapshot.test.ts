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
  const session = { tab: {} };
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

test('the attached bridge preserves screenshot dimensions and binds only authored coordinate inputs', async () => {
  const { browserArguments } = await import('../../src/main/user-browser/actions');
  const screenshot_id = '00000000-0000-4000-8000-000000000001';
  expect(
    browserResult(
      {
        screenshot_id,
        screenshot_size: { width: 1200, height: 900 },
        viewport: { width: 800, height: 600 },
      },
      'tab',
    ),
  ).toMatchObject({ screenshot_id, screenshot_size: { width: 1200, height: 900 } });
  const args = { action: 'click', screenshot_id, coordinate_space: 'normalized', x: 0.5, y: 0.5 };
  expect(
    browserArguments({ ...args, script: 'untrusted', method: 'Runtime.evaluate' }),
  ).toMatchObject(args);
  expect(browserArguments({ ...args, script: 'untrusted' })).not.toHaveProperty('script');
  for (const patch of [
    { ref: '00000000-0000-4000-8000-000000000002:1' },
    { coordinate_space: 'viewport' },
    { screenshot_id: '' },
    { action: 'fill' },
    { click_count: 2 },
  ])
    expect(() => browserArguments({ ...args, ...patch })).toThrow();
});
