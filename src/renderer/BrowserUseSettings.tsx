import { useState } from 'react';
import type { Activity } from '../shared/types';
import { BrowserApprovalSelect } from './BrowserApprovalSelect';
import { Button, Card, CheckboxCard, Field, Icon, Notice, Select } from './ui';

export function BrowserUseSettings({
  activities,
  selectedId,
  openActivity,
  defaultAutoAllow,
}: {
  activities: Activity[];
  defaultAutoAllow: boolean;
  selectedId?: string;
  openActivity: (id: string) => void;
}) {
  const [chatId, setChatId] = useState(selectedId ?? activities[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const activity = activities.find((item) => item.id === chatId);
  async function change(autoAllow: boolean) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await window.dextana.setBrowserPreferences({ autoAllow });
      setStatus('Global browser default saved.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="automation-settings" aria-label="Browser use settings">
      <CheckboxCard
        selection="switch"
        icon={<Icon name="browser" />}
        label="Automatically approve browser actions by default"
        description="Applies to existing and new chats that use the global default. Turn off to ask for approval. Chats with their own setting keep it."
        checked={defaultAutoAllow}
        disabled={busy}
        onChange={(event) => void change(event.target.checked)}
      />
      <Card>
        <h2>Chat overrides</h2>
        <p>Choose a chat to use the global default or set its own browser approvals.</p>
        <Field label="Chat">
          {(field) => (
            <Select
              {...field}
              aria-label="Browser use chat"
              value={activity?.id ?? ''}
              disabled={busy || !activities.length}
              onChange={(event) => {
                setChatId(event.target.value);
                setError('');
                setStatus('');
              }}
            >
              <option value="">
                {activities.length ? 'Choose a chat' : 'Start a chat to configure browser use'}
              </option>
              {activities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {activity && (
          <BrowserApprovalSelect
            key={activity.id}
            activity={activity}
            defaultAutoAllow={defaultAutoAllow}
          />
        )}
      </Card>
      {activity && (
        <>
          <Card>
            <h2>Tabs and sign-ins</h2>
            <p>
              Manage this chat’s tabs in its browser panel. Use “Use login from my browser” there to
              connect a website sign-in.
            </p>
            <Button
              variant="secondary"
              icon={<Icon name="arrow" />}
              onClick={() => openActivity(activity.id)}
            >
              Open chat
            </Button>
          </Card>
        </>
      )}
      {status && <Notice tone="success">{status}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  );
}
