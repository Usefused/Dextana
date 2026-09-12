import { useEffect, useState } from 'react';
import type { MCPAuthentication as Authentication } from '../shared/types';
import { Button, Icon, Modal } from './ui';

export function MCPAuthentication({ authentication }: { authentication: Authentication }) {
  const [busy, setBusy] = useState<'in-app' | 'user'>();
  const [error, setError] = useState('');
  const [openedInApp, setOpenedInApp] = useState(false);
  useEffect(() => {
    if (authentication.state !== 'waiting') setOpenedInApp(false);
  }, [authentication.state]);
  const dismiss = () => {
    void window.dextana.dismissMCPAuthentication(authentication.id).catch((failure) => {
      setError((failure as Error).message);
    });
  };
  const open = (surface: 'in-app' | 'user') => {
    setBusy(surface);
    setError('');
    void window.dextana
      .openMCPAuthentication(authentication.id, surface)
      .then(() => {
        // Removing the modal releases its native overlay so the owner can use the browser pane.
        if (surface === 'in-app') setOpenedInApp(true);
      })
      .catch((failure) => setError((failure as Error).message))
      .finally(() => setBusy(undefined));
  };
  if (openedInApp && authentication.state === 'waiting') return null;
  const complete = authentication.state === 'complete';
  const expired = authentication.state === 'expired';
  return (
    <Modal
      title={
        complete
          ? 'Account connected'
          : expired
            ? 'Connection link expired'
            : 'Connect your account'
      }
      eyebrow={authentication.connectionName}
      description={
        complete
          ? 'Fused confirmed authentication. Dextana has not repeated the previous operation.'
          : expired
            ? 'Request the action again to create a fresh, secure connection link.'
            : authentication.message
      }
      busy={!!busy}
      close={dismiss}
      actions={
        <>
          {!complete && !expired && (
            <>
              <Button
                variant="primary"
                icon={<Icon name="browser" />}
                busy={busy === 'in-app'}
                disabled={!!busy}
                onClick={() => open('in-app')}
              >
                Open in Dextana
              </Button>
              <Button
                variant="secondary"
                busy={busy === 'user'}
                disabled={!!busy}
                onClick={() => open('user')}
              >
                Open in my browser
              </Button>
            </>
          )}
          <Button variant="secondary" disabled={!!busy} onClick={dismiss}>
            {complete || expired ? 'Done' : 'Cancel'}
          </Button>
        </>
      }
    >
      {complete ? (
        <p role="status">
          {authentication.retryAllowed
            ? 'Return to the chat and explicitly ask Dextana to try the action again.'
            : 'Review the result before deciding whether to request another action.'}
        </p>
      ) : expired ? null : (
        <p>
          Sign in and choose the provider account you want Fused to use for this Dext identity.
          Dextana never receives the provider password or tokens.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
