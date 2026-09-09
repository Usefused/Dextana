import { BrowserResize } from './BrowserResize';
import { BrowserTabs, BrowserToolbar, Button, IconButton, TextInput } from './ui';
import { LoginTransfer } from './LoginTransfer';
import { useEffect, useState } from 'react';
import type { Activity, BrowserPane, LoginConnection } from '../shared/types';

export function BrowserPanel({
  browser,
  activities,
}: {
  browser: BrowserPane;
  activities: Activity[];
}) {
  const [connection, setConnection] = useState<LoginConnection>();
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
  useEffect(
    () =>
      window.dextana.onLoginOffer((id) => {
        if (id === browser.tabId)
          void act(async () => setConnection(await window.dextana.beginLoginTransfer(id)));
      }),
    [browser.tabId],
  );
  return (
    <aside className="browser-pane" aria-label="In-app browser">
      <BrowserResize />
      <div className="browser-pane-title">
        <span>◉ Activity browser</span>
        <IconButton
          icon="key"
          className="site-login-button"
          label="Use login from my browser"
          title="Use login from my browser"
          disabled={busy || browser.busyTabIds.includes(browser.tabId)}
          onClick={() => {
            void act(async () =>
              setConnection(await window.dextana.beginLoginTransfer(browser.tabId)),
            );
          }}
        />
        <div>
          <IconButton
            icon="plus"
            label="New browser tab"
            disabled={busy}
            onClick={() => {
              setAdding(!adding);
              setError('');
            }}
          />
          <IconButton
            icon="close"
            label="Close browser pane"
            onClick={() => {
              void window.dextana.hideBrowser();
            }}
          />
        </div>
      </div>
      <BrowserTabs
        selectedId={browser.tabId}
        disabled={busy}
        tabs={browser.tabs.map((tab) => {
          const owner = activities.find((activity) => activity.id === tab.activityId);
          const working = browser.busyTabIds.includes(tab.id);
          return {
            id: tab.id,
            title: tab.title,
            busy: working,
            label: `${tab.title} · ${owner?.title ?? 'Chat'}${working ? ' · Working' : ''}`,
            tooltip: `${tab.title}\n${tab.url}\n${owner?.title ?? 'Chat'}${tab.needsReopen ? ' · Saved' : ''}`,
          };
        })}
        select={(id) => {
          const tab = browser.tabs.find((tab) => tab.id === id);
          if (tab) void act(() => window.dextana.showBrowser(tab.activityId, id));
        }}
        close={(id) => void act(() => window.dextana.closeBrowserTab(id))}
      />
      <BrowserToolbar
        url={browser.url}
        disabled={busy || browser.busyTabIds.includes(browser.tabId)}
        refresh={() => void act(() => window.dextana.refreshBrowserTab(browser.tabId))}
      />
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
          <TextInput
            compact
            type="url"
            aria-label="New tab address"
            placeholder="https://example.com"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            required
          />
          <div className="dx-actions">
            <Button size="small" variant="primary" disabled={busy} type="submit">
              Open new tab
            </Button>
            <Button size="small" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="browser-error">
          {error}
        </p>
      )}
      <div className="browser-surface" />
      {connection && (
        <LoginTransfer
          key={connection.id}
          connection={connection}
          close={() => setConnection(undefined)}
        />
      )}
    </aside>
  );
}
