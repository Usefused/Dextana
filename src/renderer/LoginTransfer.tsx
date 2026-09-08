import { useEffect, useState } from 'react';
import type { LoginConnection } from '../shared/types';

export function LoginTransfer({
  connection,
  close,
}: {
  connection: LoginConnection;
  close: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const [state, setState] = useState('waiting');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const timer = setInterval(() => {
      void window.dextana
        .loginTransferStatus(connection.id)
        .then((result) => {
          if (live) {
            setState(result.state);
            setError(result.error);
          }
        })
        .catch(() => {
          if (live) {
            setState('failed');
            setError('This transfer is no longer available.');
          }
        });
    }, 700);
    return () => {
      live = false;
      clearInterval(timer);
      // A chat switch may unmount the dialog during an upload. Release its native
      // overlay once the in-flight import finishes, without cancelling halfway.
      const release = () => {
        void window.dextana.cancelLoginTransfer(connection.id).catch(() => {
          setTimeout(release, 700);
        });
      };
      release();
    };
  }, [connection.id]);
  async function dismiss() {
    try {
      await window.dextana.cancelLoginTransfer(connection.id);
      close();
    } catch {
      setError('Wait for the transfer to finish.');
    }
  }
  return (
    <div
      className="login-transfer-backdrop"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input, summary',
            ),
          ];
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.key === 'Escape' && state !== 'importing') void dismiss();
      }}
    >
      <section
        className="login-transfer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Use login from my browser"
      >
        <h2>Connect your login</h2>
        <p className="login-destination">
          <strong>{new URL(connection.origin).host}</strong>
          <span title={connection.destination}>{connection.destination}</span>
        </p>
        {state === 'waiting' && (
          <>
            <p>Paste this code into the Dextana Chrome extension.</p>
            <div className="login-code-row">
              <input
                aria-label="Browser connection code"
                autoFocus
                readOnly
                value={connection.code}
                onFocus={(event) => event.target.select()}
              />
              <button
                className="login-primary"
                onClick={() => {
                  void window.dextana
                    .copyLoginCode(connection.id)
                    .then(() => setCopied(true))
                    .catch(() => setError('Could not copy. Select the code and copy it manually.'));
                }}
              >
                {copied ? 'Copied' : 'Copy connection code'}
              </button>
            </div>
            <p className="login-caption">You choose what to share in Chrome.</p>
            <details className="login-install">
              <summary>Need the extension?</summary>
              <ol>
                <li>
                  Open <strong>chrome://extensions</strong> in Chrome.
                </li>
                <li>
                  Turn on <strong>Developer mode</strong> and choose <strong>Load unpacked</strong>.
                </li>
                <li>
                  Select the <strong>Dextana Login</strong> folder opened below.
                </li>
              </ol>
              <button
                disabled={opening}
                onClick={() => {
                  setOpening(true);
                  void window.dextana
                    .openLoginExtension(connection.id)
                    .catch(() =>
                      setError(
                        'Could not open the extension folder. Please reinstall or rebuild Dextana.',
                      ),
                    )
                    .finally(() => setOpening(false));
                }}
              >
                {opening ? 'Opening…' : 'Open extension folder'}
              </button>
              <p className="login-caption">
                Included with Dextana. Keep this folder; Chrome loads it from here.
              </p>
            </details>
          </>
        )}
        {state === 'importing' && <p role="status">Transferring login state…</p>}
        {state === 'completed' && (
          <>
            <p role="status">Login state transferred.</p>
            <p>Check the website to confirm you’re signed in.</p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          disabled={state === 'importing'}
          onClick={() => {
            void dismiss();
          }}
        >
          {state === 'completed' || state === 'failed' ? 'Done' : 'Cancel transfer'}
        </button>
      </section>
    </div>
  );
}
