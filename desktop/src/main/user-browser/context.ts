import type { Activity } from '../../shared/types';
import type { UserBrowserState } from '../../shared/user-browser';
import { rememberDesktop } from '../context';

/** Reconcile authoritative browser state after backend context merges or local changes. */
export function syncBrowserContext(activities: Activity[], states: UserBrowserState[]) {
  for (const state of states) {
    const activity = activities.find((item) => item.id === state.activityId);
    if (activity) rememberBrowserContext(activity, state);
  }
}

/** Keep broad scope visible; replace a granular placeholder with its actual task tabs. */
export function rememberBrowserContext(activity: Activity, state: UserBrowserState) {
  if (state.state === 'waiting') return;
  rememberConnection(activity, state);
  if (!state.tabs.length) return;
  if (state.scope !== 'browser')
    activity.context = activity.context?.filter((item) => item.desktop?.resourceId !== state.id);
  for (const tab of state.tabs.filter(
    (tab) => state.scope !== 'browser' || state.contextTabIds?.includes(tab.id),
  ))
    rememberDesktop(activity, tab.title, {
      work: 'computer',
      resourceId: tab.id,
      operation: 'browser.attach',
      state: state.state === 'stopped' ? 'stopped' : tab.state,
      path: tab.url,
    });
}

function rememberConnection(activity: Activity, state: UserBrowserState) {
  if (state.scope !== 'browser' && state.tabs.length) return;
  rememberDesktop(
    activity,
    state.scope === 'browser' ? 'Your browser · all tabs' : 'Browser task tabs',
    {
      work: 'computer',
      resourceId: state.id,
      operation: 'browser.attach',
      state: state.reconnecting ? 'reconnecting' : state.state,
    },
  );
}
