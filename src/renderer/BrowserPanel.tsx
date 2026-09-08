import { LoginTransfer } from './LoginTransfer';
import { useEffect, useRef, useState } from 'react';
import type { Activity, BrowserPane, LoginConnection } from '../shared/types';

export function BrowserPanel({
  browser,
  activities,
}: {
  browser: BrowserPane;
  activities: Activity[];
}) {
  const [connection, setConnection] = useState<LoginConnection>();
  const selectedTab = useRef<HTMLDivElement>(null);
  useEffect(() => {
    selectedTab.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [browser.tabId]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  async function act(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(
        (failure as Error).message.replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          '',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => window.dextana.onLoginOffer(id => {
    if (id === browser.tabId) void act(async () => setConnection(await window.dextana.beginLoginTransfer(id)));
  }), [browser.tabId]);
  return (
    <aside className="browser-pane" aria-label="In-app browser">
      <div className="browser-pane-title">
        <span>◉ Activity browser</span>
        <button
          className="site-login-button"
          aria-label="Use login from my browser"
          title="Use login from my browser"
          disabled={busy || browser.busyTabIds.includes(browser.tabId)}
          onClick={() => {
            void act(async () =>
              setConnection(await window.dextana.beginLoginTransfer(browser.tabId)),
            );
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="m11 12 8 8m-3-3 3-3m-6 0 3-3"/></svg>
        </button>
        <div>
          <button
            aria-label="New browser tab"
            disabled={busy}
            onClick={() => {
              setAdding(!adding);
              setError('');
            }}
          >
            +
          </button>
          <button
            aria-label="Close browser pane"
            onClick={() => {
              void window.dextana.hideBrowser();
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div className="browser-tabs" role="tablist" aria-label="Browser tabs">
        {browser.tabs.map((tab) => {
          const owner = activities.find((activity) => activity.id === tab.activityId);
          const working = browser.busyTabIds.includes(tab.id);
          return (
            <div
              className={`browser-tab ${browser.tabId === tab.id ? 'selected' : ''}`}
              key={tab.id}
              ref={browser.tabId === tab.id ? selectedTab : undefined}
            >
              <button
                role="tab"
                aria-selected={browser.tabId === tab.id}
                aria-label={`${tab.title} · ${owner?.title ?? 'Chat'}${working ? ' · Working' : ''}`}
                title={`${tab.title}\n${tab.url}\n${owner?.title ?? 'Chat'}${tab.needsReopen ? ' · Saved' : ''}`}
                onClick={() => {
                  void act(() => window.dextana.showBrowser(tab.activityId, tab.id));
                }}
              >
                <span>
                  {working ? '◌ ' : ''}
                  {tab.title}
                </span>

              </button>
              <button
                aria-label={`Close tab ${tab.title}`}
                disabled={working || busy}
                onClick={() => {
                  void act(() => window.dextana.closeBrowserTab(tab.id));
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <input aria-label="Activity browser address" readOnly value={browser.url} />
      {adding && (
        <form
          className="browser-new-tab"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await window.dextana.newBrowserTab(browser.activityId, address);
              setAdding(false);
              setAddress('');
            });
          }}
        >
          <label>
            New tab address
            <input
              type="url"
              aria-label="New tab address"
              placeholder="https://example.com"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
          </label>
          <button disabled={busy} type="submit">
            Open new tab
          </button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="browser-error">
          {error}
        </p>
      )}
      <div className="browser-surface" />
      {connection && (
        <LoginTransfer connection={connection} close={() => setConnection(undefined)} />
      )}
    </aside>
  );
}
