import { useState } from 'react';
import type { ComputerCommand, ComputerSnapshot } from '../shared/desktop-computer';
import { Badge, Button, Card, Icon, Notice } from './ui';

interface Props {
  snapshot: ComputerSnapshot;
}

export function ComputerUseSettings({ snapshot }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(request: ComputerCommand) {
    setBusy(true);
    setError('');
    try {
      await window.dextana.desktopComputer(request);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Computer use is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  const accessibility = snapshot.permissions?.accessibility === true;
  const screenRecording = snapshot.permissions?.screenRecording === true;

  return (
    <section className="desktop-computer" aria-label="Computer use">
      <Badge>Experimental</Badge>
      {error && <Notice tone="danger">{error}</Notice>}
      <Card>
        <p>
          Dext can inspect and operate native apps without binding a window to a chat. It asks
          before each step by default; choose Allow all on a computer-use request to continue
          automatically for that chat session.
        </p>
        <p>
          macOS requires both Accessibility, to read and operate controls, and Screen Recording, to
          show the desktop to the agent. System permission alone never enables automatic actions;
          only your separate chat approval does.
        </p>
        <p>
          Accessibility: {accessibility ? 'allowed' : 'needed'} · Screen Recording:{' '}
          {screenRecording ? 'allowed' : 'needed'}
        </p>
        {snapshot.enabled ? (
          <Notice tone="success">
            Computer use is ready. Approve each requested step, or choose Allow all for the current
            chat session.
          </Notice>
        ) : (
          <ol>
            <li>Request permission and accept any macOS prompt that appears.</li>
            <li>
              If a permission still says needed, open its System Settings page and enable Dextana.
              Development builds may appear as Electron.
            </li>
            <li>Return here and check permissions again.</li>
          </ol>
        )}
        <div className="dx-actions">
          {!snapshot.enabled && (
            <Button
              icon={<Icon name="shield" />}
              disabled={busy}
              onClick={() => void run({ action: 'permissions' })}
            >
              Request permissions
            </Button>
          )}
          {!accessibility && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run({ action: 'open-accessibility-settings' })}
            >
              Open Accessibility settings
            </Button>
          )}
          {!screenRecording && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void run({ action: 'open-screen-recording-settings' })}
            >
              Open Screen Recording settings
            </Button>
          )}
          <Button
            variant="secondary"
            icon={<Icon name="refresh" />}
            disabled={busy}
            onClick={() => void run({ action: 'enable' })}
          >
            Check permissions
          </Button>
        </div>
      </Card>
    </section>
  );
}

/** Keep revocation reachable while the owner is in chat or another workspace page. */
export function ComputerUseStatus({
  snapshot,
  failed,
}: {
  snapshot?: ComputerSnapshot;
  failed: (message: string) => void;
}) {
  const active = snapshot?.active;
  if (!active || active.state === 'stopped') return null;
  return (
    <div className="computer-use-status" role="status">
      <span>Computer use · desktop · {active.state}</span>
      <Button
        variant="danger"
        size="small"
        onClick={() =>
          void window.dextana
            .desktopComputer({ action: 'stop' })
            .catch((error) => failed(error.message))
        }
      >
        Stop computer use
      </Button>
    </div>
  );
}
