import './user-browser.css';
import { useEffect, useState } from 'react';
import type { UserBrowserPairing, UserBrowserState } from '../shared/user-browser';
import { Badge, Button, Card, FormSection, Modal, Notice, SectionHeader, TextInput } from './ui';

export function UserBrowserButton({
  activityId,
  state,
  failed,
}: {
  activityId: string;
  state?: UserBrowserState;
  failed: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState<UserBrowserPairing>();
  const [busy, setBusy] = useState(false);
  useRequestedBrowser(activityId, state, open, setOpen, setPairing);
  async function connect() {
    setBusy(true);
    try {
      setPairing(await window.dextana.beginUserBrowser(activityId));
    } catch (error) {
      failed((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (state?.state === 'waiting') await window.dextana.stopUserBrowser(activityId);
    setPairing(undefined);
    setOpen(false);
  }
  return (
    <>
      <Button variant="layout" onClick={() => setOpen(true)}>
        Use my browser
      </Button>
      {open && (
        <Modal
          className="user-browser-dialog"
          title="Use my browser"
          closeLabel="Close Use my browser"
          busy={busy}
          description="Let Dext open task tabs in Chrome or Edge using your existing sign-in, or connect tabs you already have open."
          close={() => void close().catch((error) => failed(error.message))}
          actions={
            <Button
              variant="secondary"
              onClick={() =>
                void window.dextana
                  .resetUserBrowser(activityId)
                  .then(close)
                  .catch((error) => failed(error.message))
              }
            >
              Use Dext’s in-app browser
            </Button>
          }
        >
          <FormSection>
            <p>
              Paste your connection code in the Dextana Browser extension, then select{' '}
              <strong>Activate browser access</strong>. Dext can use your regular browser tabs and
              open new ones. Turn on <strong>Granular control</strong> in the extension to choose
              specific tabs. Keep Dext open to stay connected between tasks. Browser actions follow
              your chat approval settings; used tabs appear in Context.
            </p>
            {state && state.state !== 'waiting' && (
              <Card className="user-browser-resource">
                <SectionHeader
                  title={state.title}
                  actions={<BrowserConnectionBadge state={state} />}
                />
                <div className="user-browser-tabs">
                  {state.tabs.map((tab) => (
                    <div key={tab.id} className="user-browser-tab">
                      <div>
                        <strong>{tab.title}</strong>
                        <p className="user-browser-address" title={tab.url}>
                          {browserAddress(tab.url)}
                        </p>
                      </div>
                      <Badge>{state.state === 'stopped' ? 'stopped' : tab.state}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {pairing && state?.state === 'waiting' && (
              <BrowserConnectionCode key={pairing.id} code={pairing.code} />
            )}
            <BrowserConnectionActions
              state={state}
              busy={busy}
              connect={connect}
              activityId={activityId}
              failed={failed}
            />
            <details>
              <summary>Install or update the extension</summary>
              <p>
                Open your browser’s extensions page, enable Developer mode and load the Dextana
                Login folder. For an existing installation, refresh the folder below and reload the
                extension. Chrome asks for browser-control permission when it is installed or
                updated.
              </p>
              <Button
                onClick={() =>
                  void window.dextana.openBrowserExtension().catch((error) => failed(error.message))
                }
              >
                Open extension folder
              </Button>
            </details>
          </FormSection>
        </Modal>
      )}
    </>
  );
}

function BrowserConnectionActions({
  state,
  busy,
  connect,
  activityId,
  failed,
}: {
  state?: UserBrowserState;
  busy: boolean;
  connect: () => Promise<void>;
  activityId: string;
  failed: (message: string) => void;
}) {
  if (state?.state === 'waiting') return null;
  return (
    <div className="dx-actions">
      {state?.state === 'connected' ? (
        <Button
          variant="danger"
          onClick={() =>
            void window.dextana.stopUserBrowser(activityId).catch((error) => failed(error.message))
          }
        >
          Stop browser control
        </Button>
      ) : (
        <Button variant="primary" disabled={busy} onClick={() => void connect()}>
          {busy ? 'Creating code…' : 'Create connection code'}
        </Button>
      )}
    </div>
  );
}

function BrowserConnectionCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy() {
    try {
      await window.dextana.copyText(code);
      setCopied(true);
      setError('');
    } catch {
      setCopied(false);
      setError('Could not copy. Select the code and copy it manually.');
    }
  }
  return (
    <div className="user-browser-code">
      <div className="user-browser-code-row">
        <TextInput
          aria-label="Browser control connection code"
          readOnly
          value={code}
          onFocus={(event) => event.target.select()}
        />
        <Button variant="primary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy connection code'}
        </Button>
      </div>
      <p role="status">
        {copied
          ? 'Code copied. Paste it in the browser extension.'
          : 'Code ready. Waiting for you to connect in the browser extension.'}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
export function UserBrowserStatus({
  state,
  failed,
}: {
  state?: UserBrowserState;
  failed: (message: string) => void;
}) {
  if (!state || state.state === 'waiting') return null;
  return (
    <Notice className="user-browser-notice">
      <div className="user-browser-status">
        <span>
          <strong>{state.title}</strong> · {browserConnectionLabel(state)}
        </span>
        {state.state === 'connected' && (
          <Button
            variant="danger"
            size="small"
            onClick={() =>
              void window.dextana
                .stopUserBrowser(state.activityId)
                .catch((error) => failed(error.message))
            }
          >
            Stop browser control
          </Button>
        )}
      </div>
    </Notice>
  );
}

function browserConnectionLabel(state: UserBrowserState) {
  if (state.reconnecting) return 'Reconnecting automatically…';
  if (state.state !== 'connected') return state.message;
  return state.scope === 'browser'
    ? 'Browser access active · all tabs'
    : 'Browser connected · selected tabs';
}
function BrowserConnectionBadge({ state }: { state: UserBrowserState }) {
  return <Badge>{state.reconnecting ? 'Reconnecting' : state.state}</Badge>;
}

function browserAddress(value: string) {
  if (!value) return 'Waiting for a tab';
  try {
    const url = new URL(value);
    return url.host + url.pathname;
  } catch {
    return value;
  }
}

// The pairing secret is fetched only by the trusted dialog, never returned to the agent.
function useRequestedBrowser(
  activityId: string,
  state: UserBrowserState | undefined,
  open: boolean,
  setOpen: (open: boolean) => void,
  setPairing: (pairing: UserBrowserPairing | undefined) => void,
) {
  const requestedId = state?.requested ? state.id : undefined;
  const waiting = state?.state === 'waiting';
  useEffect(() => {
    if (!requestedId) return;
    setOpen(waiting);
    if (!waiting) setPairing(undefined);
  }, [requestedId, waiting, setOpen, setPairing]);
  useEffect(() => {
    if (!waiting || !open) return;
    let current = true;
    void window.dextana
      .userBrowserPairing(activityId)
      .then((pairing) => {
        if (current) setPairing(pairing);
      })
      .catch(() => {
        if (current) setPairing(undefined);
      });
    return () => {
      current = false;
    };
  }, [activityId, state?.id, waiting, open, setPairing]);
}
