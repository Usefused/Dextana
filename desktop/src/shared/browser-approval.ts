import type { BrowserTab } from './types';

export function browserApprovalDetails(args: Record<string, unknown>, tabs: BrowserTab[]) {
  if (args.action === 'connect_user') return { action: 'connect_user' };
  if (args.action === 'disconnect_user')
    return { action: 'disconnect_user', browser: 'Your attached browser' };
  const { tab_id, _userConnection, _userURL, _userTitle, _userTarget, ...details } = args;
  if (_userConnection) {
    const { ref, ...action } = details;
    return {
      ...action,
      browser: 'Your attached browser',
      page: { ...(_userTitle ? { title: _userTitle } : {}), address: _userURL },
      ...(_userTarget ? { control: _userTarget } : {}),
    };
  }
  if (typeof tab_id !== 'string' || !tab_id) return { ...details, browser: 'in-app' };
  const tab = tabs.find((item) => item.id === tab_id);
  return {
    ...details,
    browser: 'in-app',
    page: tab
      ? { title: tab.title || 'Untitled page', address: tab.url }
      : 'Unavailable browser tab',
  };
}

export function browserPermissionQuestion(
  raw: string,
): { question: string; address?: string } | undefined {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(raw);
  } catch {
    return;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  if (Object.keys(args).some((key) => !['action', 'page', 'url', 'browser'].includes(key))) return;
  const page =
    args.page && typeof args.page === 'object' ? (args.page as Record<string, unknown>) : undefined;
  const title = typeof page?.title === 'string' && page.title ? `“${page.title}”` : 'this page';
  const address =
    typeof args.url === 'string'
      ? args.url
      : typeof page?.address === 'string'
        ? page.address
        : undefined;
  switch (args.action) {
    case 'connect_user':
      return { question: 'Allow Dext to request access to your Chrome or Edge browser?' };
    case 'disconnect_user':
      return {
        question: 'Allow Dext to disconnect the attached Chrome or Edge browser? Tabs stay open.',
      };
    case 'list_tabs':
      return { question: 'Allow Dext to view the open tabs in this chat?' };
    case 'read':
      return { question: `Allow Dext to read ${title}?`, address };
    case 'close_tab':
      return { question: `Allow Dext to close ${title}?`, address };
    case 'open':
      return {
        question:
          args.browser === 'in-app'
            ? 'Allow Dext to navigate in its in-app browser?'
            : 'Allow Dext to navigate to this website?',
        address,
      };
    case 'new_tab':
      return { question: 'Allow Dext to open a new browser tab?', address };
    default:
      return;
  }
}
