import { expect, test } from 'vitest';
import type { Activity } from '../../src/shared/types';
import { rememberFile, rememberReferences, rememberURL } from '../../src/main/context';

test('context tracks provenance without duplicating or downgrading already-read files and visited links', () => {
  const activity = { id: 'one' } as Activity;
  rememberFile(activity, '/documents/Budget.xlsx', 'selected');
  rememberFile(activity, '/documents/Budget.xlsx', 'read');
  rememberFile(activity, '/documents/Budget.xlsx', 'selected');
  rememberReferences(activity, 'Use https://example.com/budget. Ignore javascript:alert(1)');
  rememberURL(activity, 'https://example.com/budget', 'visited');
  rememberReferences(activity, 'See [Budget](https://example.com/budget).');
  rememberURL(activity, 'https://user:secret@example.com', 'visited');
  expect(
    activity.context?.map(({ kind, location, status }) => ({ kind, location, status })),
  ).toEqual([
    { kind: 'file', location: '/documents/Budget.xlsx', status: 'read' },
    { kind: 'url', location: 'https://example.com/budget', status: 'visited' },
  ]);
  expect(({ id: 'two' } as Activity).context).toBeUndefined();
});
