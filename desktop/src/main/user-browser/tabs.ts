import { randomUUID } from 'node:crypto';
import type { UserBrowserState, UserBrowserTab } from '../../shared/user-browser';
import { elementLabels, pageInfo, httpURL } from './protocol';

export function tabInfo(value: unknown, created = false): UserBrowserTab {
  if (!value || typeof value !== 'object') throw new Error('Invalid browser tab.');
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !/^[a-f0-9-]{36}$/.test(record.id))
    throw new Error('Invalid tab reference.');
  return {
    id: record.id,
    ...pageInfo(record),
    state: record.state === 'closed' ? 'closed' : 'connected',
    created,
  };
}
/** References and defaults belong to tabs, never to the browser's foreground selection. */
export class UserBrowserTabs {
  private labels = new Map<string, Map<string, string>>();
  private defaultId = '';
  private reservations = new Map<string, unknown>();
  private creating = new Set<string>();
  constructor(private state: UserBrowserState) {}
  attach(value: unknown) {
    if (!Array.isArray(value) || value.length > (this.state.scope === 'browser' ? 1000 : 12))
      throw new Error('Select up to twelve existing tabs, or let Dext open its own.');
    const tabs = value.map((tab) => tabInfo(tab));
    if (new Set(tabs.map((tab) => tab.id)).size !== tabs.length)
      throw new Error('Duplicate tab reference.');
    if (tabs.some((tab) => tab.state !== 'connected')) throw new Error('Select open tabs.');
    this.state.tabs = tabs;
    this.defaultId = tabs[0]?.id ?? '';
    this.summary();
  }
  target(args: Record<string, unknown>) {
    if (args.action === 'new_tab') {
      this.checkCapacity(0);
      if (this.reservations.size >= 100)
        throw new Error('Too many pending tab approvals. Reconnect.');
      const id = randomUUID();
      this.reservations.set(id, httpURL(args.url));
      return {
        id,
        url: '',
        title: 'New browser tab',
        created: true,
        state: 'connected' as const,
      };
    }
    const tab = this.state.tabs.find((tab) => tab.id === (args.tab_id || this.defaultId));
    if (!tab || tab.state !== 'connected')
      throw new Error(
        'This tab is closed or not attached to this chat. Use list_tabs and an explicit tab_id.',
      );
    return tab;
  }
  consume(args: Record<string, unknown>) {
    const id = String(args.tab_id);
    if (!this.reservations.has(id) || this.reservations.get(id) !== args.url)
      throw new Error('This new-tab approval is invalid or already used.');
    this.reservations.delete(id);
    this.creating.add(id);
  }
  label(tabId: string, ref: unknown) {
    if (!ref) return;
    const label = this.labels.get(tabId)?.get(String(ref));
    if (!label) throw new Error('Read this tab and use a current element reference.');
    return label;
  }
  update(value: unknown) {
    if (!Array.isArray(value) || value.length > 2000)
      throw new Error('Invalid browser tab inventory.');
    const records = value.map((item) => tabInfo(item));
    const present = new Set(records.map((item) => item.id));
    for (const tab of this.state.tabs) {
      if (!present.has(tab.id)) {
        tab.state = 'closed';
        this.labels.delete(tab.id);
      }
    }
    for (const info of records) this.updateTab(info);
    const closed = this.state.tabs.filter((tab) => tab.state === 'closed').slice(-100);
    this.state.tabs = [...this.state.tabs.filter((tab) => tab.state === 'connected'), ...closed];
    this.summary();
  }
  private updateTab(info: UserBrowserTab) {
    const tab = this.state.tabs.find((item) => item.id === info.id);
    if (!tab) {
      if (
        this.state.scope === 'browser' &&
        info.state === 'connected' &&
        !this.reservations.has(info.id) &&
        !this.creating.has(info.id)
      )
        this.state.tabs.push(info);
      return;
    }
    if (tab.url !== info.url || info.state === 'closed') this.labels.delete(tab.id);
    if (tab.state !== 'closed') Object.assign(tab, info, { created: tab.created });
  }
  complete(action: string, tabId: string, result: Record<string, unknown>, expectedURL: string) {
    if (action === 'new_tab') {
      this.creating.delete(tabId);
      if (!result.error) this.add(tabId, result);
    }
    const tab = this.state.tabs.find((tab) => tab.id === tabId);
    if (!tab) return;
    if (this.stale(tab, result, expectedURL)) {
      this.labels.delete(tabId);
      return {
        error: 'The tab changed while this action was running. Read it again before continuing.',
        tab_id: tabId,
        browser: 'user',
      };
    }
    if (typeof result.url === 'string') tab.url = result.url;
    if (typeof result.title === 'string') tab.title = result.title;
    this.invalidate(action, tab, result);
    if (!result.error && action !== 'close_tab' && Array.isArray(result.elements))
      this.labels.set(tabId, elementLabels(result));
    this.summary();
  }
  private stale(tab: UserBrowserTab, result: Record<string, unknown>, expectedURL: string) {
    if (result.error) return false;
    return tab.url !== expectedURL && tab.url !== result.url;
  }
  private invalidate(action: string, tab: UserBrowserTab, result: Record<string, unknown>) {
    if (['click', 'fill', 'press', 'scroll', 'hover', 'open', 'close_tab'].includes(action))
      this.labels.delete(tab.id);
    if (action === 'close_tab' && !result.error) tab.state = 'closed';
    if (!result.error) this.defaultId = tab.id;
  }
  private add(id: string, result: Record<string, unknown>) {
    if (this.state.tabs.some((tab) => tab.id === id))
      throw new Error('Duplicate browser tab result.');
    this.state.tabs.push(tabInfo({ ...result, id }, true));
  }
  checkCapacity(pending: number) {
    if (
      this.state.tabs.filter((tab) => tab.state === 'connected').length + pending >=
        (this.state.scope === 'browser' ? 1000 : 12) ||
      this.state.tabs.length + pending >= 2000
    )
      throw new Error(
        'Close a Dext-created tab before opening another, or start a new connection.',
      );
  }
  clearObservations() {
    this.labels.clear();
    this.reservations.clear();
    this.creating.clear();
  }
  private summary() {
    const live = this.state.tabs.filter((tab) => tab.state === 'connected');
    this.state.title = live.length
      ? `${live.length} browser ${live.length === 1 ? 'tab' : 'tabs'}`
      : 'Ready to open task tabs';
    this.state.url = live[0]?.url ?? '';
  }
  list() {
    return {
      browser: 'user',
      scope: this.state.scope,
      coverage:
        this.state.scope === 'browser'
          ? 'All regular web tabs in the connected browser profile. Other profiles and private windows are excluded.'
          : 'Only the selected tabs and Dext-created tabs. Missing tabs may still be open in the browser but outside this grant. If the owner asks to reuse a tab, do not open a replacement; ask them to include that tab or enable browser-wide access.',
      tabs: this.state.tabs
        .filter((tab) => tab.state === 'connected')
        .map((tab) => ({ tab_id: tab.id, title: tab.title, url: tab.url, created: tab.created })),
      actions: [
        'read',
        'click',
        'fill',
        'press',
        'scroll',
        'hover',
        'screenshot',
        'open',
        'new_tab',
        'close_tab',
        'list_tabs',
        'downloads',
      ],
      limits:
        'When tabs is empty, use new_tab with a website URL; approval is required under the chat browser permission policy. Use explicit tab_id for multi-tab work. References are scoped to each tab. New tabs, cross-website navigation and download receipts are supported. Only Dext-created tabs can be closed by the agent. Top document and open shadow roots only.',
    };
  }
}
