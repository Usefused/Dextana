import type { BrowserTab } from './types';

export function browserApprovalDetails(args: Record<string, unknown>, tabs: BrowserTab[]) {
  const { tab_id, ...details } = args;
  if (typeof tab_id !== 'string' || !tab_id) return details;
  const tab = tabs.find(item => item.id === tab_id);
  return {
    ...details,
    page: tab ? { title: tab.title || 'Untitled page', address: tab.url } : 'Unavailable browser tab',
  };
}

export function browserPermissionQuestion(raw: string): { question: string; address?: string } | undefined {
  let args: Record<string, unknown>;
  try { args = JSON.parse(raw); } catch { return; }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  if (Object.keys(args).some(key => !['action', 'page', 'url'].includes(key))) return;
  const page = args.page && typeof args.page === 'object' ? args.page as Record<string, unknown> : undefined;
  const title = typeof page?.title === 'string' && page.title ? `“${page.title}”` : 'this page';
  const address = typeof args.url === 'string' ? args.url : typeof page?.address === 'string' ? page.address : undefined;
  switch (args.action) {
    case 'list_tabs': return { question: 'Allow Dextana to view the open tabs in this chat?' };
    case 'read': return { question: `Allow Dextana to read ${title}?`, address };
    case 'close_tab': return { question: `Allow Dextana to close ${title}?`, address };
    case 'open': return { question: 'Allow Dextana to navigate to this website?', address };
    case 'new_tab': return { question: 'Allow Dextana to open a new browser tab?', address };
    default: return;
  }
}
