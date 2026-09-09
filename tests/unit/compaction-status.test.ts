import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CompactionStatus } from '../../src/renderer/CompactionStatus';
import type { ActivityStatus } from '../../src/shared/types';

test('compaction indicator has an accessible status and no dismissal control', () => {
  const html = renderToStaticMarkup(createElement(CompactionStatus, { activity: { status: 'running', compacting: true } }));
  expect(html).toContain('role="status"');
  expect(html).toContain('Compacting conversation…');
  expect(html).not.toContain('<button');
});

test('the indicator disappears after compaction and cannot linger on an ended run', () => {
  expect(renderToStaticMarkup(createElement(CompactionStatus, { activity: { status: 'running', compacting: false } }))).toBe('');
  for (const status of ['completed', 'failed', 'cancelled', 'interrupted'] as ActivityStatus[]) {
    expect(renderToStaticMarkup(createElement(CompactionStatus, { activity: { status, compacting: true } }))).toBe('');
  }
  expect(renderToStaticMarkup(createElement(CompactionStatus))).toBe('');
});
