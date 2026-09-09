import { useState } from 'react';
import type { Activity } from '../shared/types';
import type { ComputerCommand, ComputerSnapshot, ComputerWindow } from '../shared/desktop-computer';
import { Badge, Button, Card, Field, Icon, Notice, SectionHeader, Select } from './ui';

interface Props {
  snapshot: ComputerSnapshot;
  activities: Activity[];
  openActivity: (id: string) => void;
}
function WindowSelection({
  windows,
  activities,
  busy,
  select,
}: {
  windows: ComputerWindow[];
  activities: Activity[];
  busy: boolean;
  select: (windowId: string, activityId: string) => void;
}) {
  const [windowId, setWindowId] = useState('');
  const [activityId, setActivityId] = useState('');
  return (
    <div className="desktop-computer-form">
      <Field label="Window">
        {(field) => (
          <Select
            {...field}
            aria-label="Computer use window"
            value={windowId}
            onChange={(event) => setWindowId(event.target.value)}
          >
            <option value="">Choose an open window</option>
            {windows.map((window) => (
              <option key={window.id} value={window.id}>
                {window.application} · {window.title || 'Untitled window'}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Chat">
        {(field) => (
          <Select
            {...field}
            aria-label="Computer use chat"
            value={activityId}
            onChange={(event) => setActivityId(event.target.value)}
          >
            <option value="">Choose a chat</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button
        disabled={busy || !windowId || !activityId}
        onClick={() => select(windowId, activityId)}
      >
        Use this window
      </Button>
    </div>
  );
}
function CurrentWindow({ snapshot, openActivity }: Pick<Props, 'snapshot' | 'openActivity'>) {
  const selected = snapshot.selection;
  if (!selected) return null;
  return (
    <Card data-desktop-resource={selected.id}>
      <SectionHeader
        title={selected.window.application}
        description={selected.window.title}
        actions={
          <>
            <Badge>{selected.state}</Badge>
            <Button variant="secondary" onClick={() => openActivity(selected.activityId)}>
              Open chat
            </Button>
          </>
        }
      />
    </Card>
  );
}
export function ComputerUseSettings({ snapshot, activities, openActivity }: Props) {
  const [windows, setWindows] = useState<ComputerWindow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(request: ComputerCommand) {
    setBusy(true);
    setError('');
    try {
      const response = await window.dextana.desktopComputer(request);
      if (Array.isArray(response)) setWindows(response);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Computer use is unavailable.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="desktop-computer" aria-label="Computer use">
      <Badge>Experimental</Badge>
      {error && <Notice tone="danger">{error}</Notice>}
      <Card>
        <p>
          Inspect native controls, enter text and navigate an app through chat. Dext reviews actions
          through the existing desktop permissions. The selected window appears in Context.
        </p>
        <p>
          Control ends when the agent turn finishes, after five idle minutes, or when you press
          Stop. This trial uses background accessibility controls; some apps and file dialogs need a
          different window selected.
        </p>
        {!snapshot.enabled && (
          <div className="dx-actions">
            <Button
              icon={<Icon name="shield" />}
              disabled={busy}
              onClick={() => void run({ action: 'permissions' })}
            >
              Request computer permissions
            </Button>
            <Button
              variant="secondary"
              icon={<Icon name="refresh" />}
              disabled={busy}
              onClick={() => void run({ action: 'enable' })}
            >
              Check permissions
            </Button>
          </div>
        )}
        {snapshot.permissions && (
          <p>
            Accessibility: {snapshot.permissions.accessibility ? 'allowed' : 'needed'} · Screen
            Recording: {snapshot.permissions.screenRecording ? 'allowed' : 'needed'}. After granting
            access in System Settings, check again. macOS may require restarting Dext.
          </p>
        )}
        {snapshot.enabled && (
          <div className="dx-actions">
            <Button
              variant="secondary"
              icon={<Icon name="refresh" />}
              disabled={busy}
              onClick={() => void run({ action: 'windows' })}
            >
              Refresh open windows
            </Button>
            <Button variant="secondary" onClick={() => void run({ action: 'disable' })}>
              Disable computer use
            </Button>
          </div>
        )}
      </Card>
      {snapshot.enabled && (
        <Card>
          <WindowSelection
            windows={windows}
            activities={activities}
            busy={busy}
            select={(windowId, activityId) => void run({ action: 'select', windowId, activityId })}
          />
        </Card>
      )}
      <CurrentWindow snapshot={snapshot} openActivity={openActivity} />
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
  const selected = snapshot?.selection;
  if (!selected || selected.state === 'stopped') return null;
  return (
    <div className="computer-use-status" role="status">
      <span>
        Computer use · {selected.window.application} · {selected.window.title}
      </span>
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
