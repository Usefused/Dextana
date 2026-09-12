import { expect, test } from 'vitest';
import { browserApprovalDetails } from '../../src/shared/browser-approval';

test('browser approvals show the exact selected page without changing execution targets', () => {
  const args = { action: 'read', tab_id: 'opaque-id' };
  expect(
    browserApprovalDetails(args, [
      {
        id: 'opaque-id',
        activityId: 'chat',
        title: 'Project overview',
        url: 'https://example.com/project',
        needsReopen: false,
      },
    ]),
  ).toEqual({
    action: 'read',
    browser: 'in-app',
    page: { title: 'Project overview', address: 'https://example.com/project' },
  });
  expect(args.tab_id).toBe('opaque-id');
  expect(browserApprovalDetails(args, [])).toEqual({
    action: 'read',
    browser: 'in-app',
    page: 'Unavailable browser tab',
  });
  expect(browserApprovalDetails({ action: 'new_tab', url: 'https://example.com' }, [])).toEqual({
    action: 'new_tab',
    browser: 'in-app',
    url: 'https://example.com',
  });
  expect(
    browserApprovalDetails(
      { action: 'disconnect_user', _userConnection: 'private-connection-id' },
      [],
    ),
  ).toEqual({ action: 'disconnect_user', browser: 'Your attached browser' });
});

test('simple permissions are questions without hiding extra action inputs', async () => {
  const { browserPermissionQuestion } = await import('../../src/shared/browser-approval');
  expect(browserPermissionQuestion('{"action":"list_tabs"}')?.question).toBe(
    'Allow Dext to view the open tabs in this chat?',
  );
  expect(
    browserPermissionQuestion(
      JSON.stringify({ action: 'read', page: { title: 'Budget', address: 'https://example.com' } }),
    ),
  ).toEqual({ question: 'Allow Dext to read “Budget”?', address: 'https://example.com' });
  expect(browserPermissionQuestion('{"action":"fill","text":"Important input"}')).toBeUndefined();
  expect(browserPermissionQuestion('{"action":"read","selector":"#private"}')).toBeUndefined();
  expect(
    browserPermissionQuestion('{"action":"disconnect_user","browser":"Your attached browser"}')
      ?.question,
  ).toBe('Allow Dext to disconnect the attached Chrome or Edge browser? Tabs stay open.');
});
