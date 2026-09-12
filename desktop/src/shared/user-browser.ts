export interface UserBrowserTab {
  id: string;
  title: string;
  url: string;
  state: 'connected' | 'closed';
  created: boolean;
}
export interface UserBrowserState {
  id: string;
  activityId: string;
  state: 'waiting' | 'connected' | 'stopped';
  title: string;
  url: string;
  tabs: UserBrowserTab[];
  message?: string;
  requested?: boolean;
  scope?: 'browser' | 'tabs';
  reconnecting?: boolean;
  contextTabIds?: string[];
}
export interface UserBrowserPairing {
  id: string;
  code: string;
}
export interface UserBrowserCommand {
  requestId: string;
  action: string;
  tabId: string;
  arguments: Record<string, unknown>;
  expectedURL: string;
}
