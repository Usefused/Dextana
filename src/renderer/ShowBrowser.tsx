import { Button } from './ui';
import { useState } from 'react';
import type { Activity } from '../shared/types';

export function ShowBrowser({ activity, failed }: { activity: Activity; failed: (message: string) => void }) {
  const [opening, setOpening] = useState(false);
  if (!activity.browser?.tabs?.some(tab => tab.activityId === activity.id)) return null;
  return <Button variant="layout" className="chat-show-browser" disabled={opening} title={activity.browser.needsReopen ? `Reopen ${activity.browser.url}` : 'Show this chat’s browser'} onClick={async () => {
    setOpening(true);
    failed('');
    try { await window.dextana.showBrowser(activity.id); }
    catch (error) { failed((error as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { setOpening(false); }
  }}>
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M3 7h14" stroke="currentColor" strokeWidth="1.3"/><circle cx="5" cy="5.3" r=".6" fill="currentColor"/></svg>
    {opening ? 'Opening browser…' : activity.browser.needsReopen ? 'Reopen browser' : 'Show browser'}
  </Button>;
}
