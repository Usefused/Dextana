import { Button, Modal, TextInput, Icon } from './ui';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { LoginConnection } from '../shared/types';
import './LoginTransfer.css';

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
            if (result.error) setError(result.error);
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
  if (state === 'completed')
    return createPortal(
      <section className="login-transfer-result" role="status">
        <strong>Login state transferred.</strong>
        <p>Check the website to confirm you’re signed in.</p>
        <Button
          icon={<Icon name="check" />}
          variant="secondary"
          onClick={() => {
            void dismiss();
          }}
        >
          Done
        </Button>
      </section>,
      document.body,
    );
  return (
    <Modal
      title="Use login from my browser"
      className="login-transfer-modal"
      busy={state === 'importing'}
      close={() => void dismiss()}
    >
      <p className="login-destination">
        <strong>{new URL(connection.origin).host}</strong>
        <span title={connection.destination}>{connection.destination}</span>
      </p>
      {state === 'waiting' && (
        <>
          <p>Paste this code into the Dextana Chrome extension.</p>
          <div className="login-code-row">
            <TextInput
              aria-label="Browser connection code"
              autoFocus
              readOnly
              value={connection.code}
              onFocus={(event) => event.target.select()}
            />
            <Button
              icon={<Icon name="file" />}
              variant="primary"
              className="login-primary"
              onClick={() => {
                void window.dextana
                  .copyLoginCode(connection.id)
                  .then(() => {
                    setCopied(true);
                    setError('');
                  })
                  .catch(() => setError('Could not copy. Select the code and copy it manually.'));
              }}
            >
              {copied ? 'Copied' : 'Copy connection code'}
            </Button>
          </div>
          <p className="login-caption">
            Open the extension on your signed-in website and approve the transfer. Keep this dialog
            open; Dextana will show the website when it’s ready.
          </p>
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
            <Button
              icon={<Icon name="folder" />}
              variant="secondary"
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
            </Button>
            <p className="login-caption">
              Included with Dextana. Keep this folder; Chrome loads it from here.
            </p>
          </details>
        </>
      )}
      {state === 'importing' && <p role="status">Transferring login state…</p>}
      {error && <p role="alert">{error}</p>}
      <Button
        icon={<Icon name="close" />}
        variant="secondary"
        disabled={state === 'importing'}
        onClick={() => {
          void dismiss();
        }}
      >
        {state === 'failed' ? 'Done' : 'Cancel transfer'}
      </Button>
    </Modal>
  );
}
