import { expect, test } from 'vitest';
import { browserApprovalDetails } from '../../src/shared/browser-approval';

test('browser approvals show the exact selected page without changing execution targets', () => {
  const args = { action: 'read', tab_id: 'opaque-id' };
  expect(browserApprovalDetails(args, [{ id: 'opaque-id', activityId: 'chat', title: 'Project overview', url: 'https://example.com/project', needsReopen: false }])).toEqual({ action: 'read', page: { title: 'Project overview', address: 'https://example.com/project' } });
  expect(args.tab_id).toBe('opaque-id');
  expect(browserApprovalDetails(args, [])).toEqual({ action: 'read', page: 'Unavailable browser tab' });
  expect(browserApprovalDetails({ action: 'new_tab', url: 'https://example.com' }, [])).toEqual({ action: 'new_tab', url: 'https://example.com' });
});

test('simple permissions are questions without hiding extra action inputs', async () => {
  const { browserPermissionQuestion } = await import('../../src/shared/browser-approval');
  expect(browserPermissionQuestion('{"action":"list_tabs"}')?.question).toBe('Allow Dextana to view the open tabs in this chat?');
  expect(browserPermissionQuestion(JSON.stringify({ action: 'read', page: { title: 'Budget', address: 'https://example.com' } }))).toEqual({ question: 'Allow Dextana to read “Budget”?', address: 'https://example.com' });
  expect(browserPermissionQuestion('{"action":"fill","text":"Important input"}')).toBeUndefined();
  expect(browserPermissionQuestion('{"action":"read","selector":"#private"}')).toBeUndefined();
});
