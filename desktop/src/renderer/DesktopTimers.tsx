import { useEffect, useId, useState } from 'react';
import type {
  DesktopAlarm,
  DesktopAlarmSnapshot,
  DesktopTimeFilesRequest,
} from '../shared/desktop-time-files';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Notice,
  SectionHeader,
  Modal,
  TextInput,
  type IconName,
} from './ui';
import './desktop-timers.css';

type AlarmKind = DesktopAlarm['kind'];
type AlarmAction = (request: DesktopTimeFilesRequest) => Promise<boolean>;
const editorCopy = {
  timer: {
    title: 'New timer',
    description: 'Give your countdown a name and choose its duration.',
    field: 'Timer name',
    placeholder: 'e.g. Take a break',
    submit: 'Start timer',
    icon: 'play' as const,
  },
  reminder: {
    title: 'New reminder',
    description: 'Choose what to remember and when to be reminded.',
    field: 'Reminder',
    placeholder: 'What should we remind you about?',
    submit: 'Save reminder',
    icon: 'check' as const,
  },
};
function creationRequest(
  kind: AlarmKind,
  title: string,
  minutes: string,
  date: string,
): DesktopTimeFilesRequest {
  if (kind === 'timer')
    return {
      operation: 'timer.start',
      title: title.trim() || 'Timer',
      durationSeconds: Number(minutes) * 60,
    };
  const timestamp = new Date(date);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Choose a date and time.');
  return {
    operation: 'reminder.create',
    title: title.trim() || 'Reminder',
    message: title.trim() || 'Reminder',
    dueAt: timestamp.toISOString(),
  };
}
function AlarmTimingField({
  kind,
  minutes,
  date,
  setMinutes,
  setDate,
}: {
  kind: AlarmKind;
  minutes: string;
  date: string;
  setMinutes: (value: string) => void;
  setDate: (value: string) => void;
}) {
  if (kind === 'timer')
    return (
      <Field label="Minutes">
        {(props) => (
          <TextInput
            {...props}
            aria-label="Timer minutes"
            type="number"
            min="0.01"
            step="any"
            required
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        )}
      </Field>
    );
  return (
    <Field label="Date and time" hint="Your computer’s local time.">
      {(props) => (
        <TextInput
          {...props}
          aria-label="Reminder date and time"
          type="datetime-local"
          step="1"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      )}
    </Field>
  );
}
function AlarmEditor({
  kind,
  busy,
  error,
  onCreate,
  close,
}: {
  kind: AlarmKind;
  busy: boolean;
  error: string;
  onCreate: AlarmAction;
  close: () => void;
}) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('5');
  const [date, setDate] = useState('');
  const [inputError, setInputError] = useState('');
  const copy = editorCopy[kind];
  const problem = inputError || error;
  async function submit() {
    setInputError('');
    try {
      if (await onCreate(creationRequest(kind, title, minutes, date))) close();
    } catch (failure) {
      setInputError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <Modal
      className="desktop-alarm-modal"
      title={copy.title}
      description={copy.description}
      busy={busy}
      close={close}
      actions={
        <>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={busy}
            icon={<Icon name={copy.icon} />}
          >
            {copy.submit}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="desktop-alarm-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="desktop-alarm-fields">
          <Field label={copy.field}>
            {(props) => (
              <TextInput
                {...props}
                autoFocus
                aria-label="Desktop alarm title"
                placeholder={copy.placeholder}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={200}
              />
            )}
          </Field>
          <AlarmTimingField
            kind={kind}
            minutes={minutes}
            date={date}
            setMinutes={setMinutes}
            setDate={setDate}
          />
        </div>
      </form>
      {problem && <Notice tone="danger">{problem}</Notice>}
    </Modal>
  );
}
function alarmLabel(alarm: DesktopAlarm) {
  if (alarm.state === 'ringing') return alarm.overdue ? 'Overdue' : 'Due now';
  if (alarm.state === 'running') return alarm.kind === 'timer' ? 'Running' : 'Scheduled';
  return { paused: 'Paused', cancelled: 'Cancelled', dismissed: 'Dismissed' }[alarm.state];
}
function alarmTone(alarm: DesktopAlarm) {
  if (alarm.state === 'ringing') return 'warning';
  return alarm.state === 'running' ? 'success' : 'neutral';
}
function alarmMeta(alarm: DesktopAlarm) {
  const kind = alarm.kind === 'timer' ? 'Timer' : 'Reminder';
  if (alarm.state === 'ringing' && alarm.overdue) return kind + ' · Ready when you are';
  if (alarm.state === 'running' && alarm.dueAt)
    return `${kind} · Due ${new Date(alarm.dueAt).toLocaleString()}`;
  return kind;
}
function countdown(alarm: DesktopAlarm, now: number) {
  const remaining =
    alarm.state === 'running' && alarm.dueAt ? Date.parse(alarm.dueAt) - now : alarm.remainingMs;
  const seconds = Math.ceil(Math.max(0, remaining) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}
interface AlarmButton {
  label: string;
  icon: IconName;
  variant?: 'primary' | 'ghost';
  request: DesktopTimeFilesRequest;
}
function alarmButtons(alarm: DesktopAlarm): AlarmButton[] {
  const buttons: AlarmButton[] = [];
  if (alarm.kind === 'timer' && alarm.state === 'running')
    buttons.push({
      label: 'Pause',
      icon: 'pause',
      request: { operation: 'timer.pause', id: alarm.id },
    });
  if (alarm.kind === 'timer' && alarm.state === 'paused')
    buttons.push({
      label: 'Resume',
      icon: 'play',
      request: { operation: 'timer.resume', id: alarm.id },
    });
  if (alarm.state === 'ringing')
    buttons.push(
      {
        label: 'Snooze 5 min',
        icon: 'refresh',
        request: { operation: 'reminder.snooze', id: alarm.id, durationSeconds: 300 },
      },
      {
        label: 'Dismiss',
        icon: 'check',
        variant: 'primary',
        request: { operation: 'reminder.dismiss', id: alarm.id },
      },
    );
  else if (['running', 'paused'].includes(alarm.state))
    buttons.push({
      label: 'Cancel',
      icon: 'close',
      variant: 'ghost',
      request: { operation: 'timer.cancel', id: alarm.id },
    });
  return buttons;
}
function AlarmActions({
  alarm,
  busy,
  act,
  onOpenActivity,
}: {
  alarm: DesktopAlarm;
  busy: boolean;
  act: AlarmAction;
  onOpenActivity?: (id: string) => void;
}) {
  return (
    <div className="desktop-alarm-actions">
      {alarmButtons(alarm).map((button) => (
        <Button
          key={button.label}
          size="small"
          variant={button.variant}
          icon={<Icon name={button.icon} />}
          disabled={busy}
          onClick={() => void act(button.request)}
        >
          {button.label}
        </Button>
      ))}
      {alarm.sourceActivityId && onOpenActivity && (
        <Button
          size="small"
          variant="ghost"
          icon={<Icon name="arrow" />}
          onClick={() => onOpenActivity(alarm.sourceActivityId!)}
        >
          Open chat
        </Button>
      )}
    </div>
  );
}
function AlarmCard({
  alarm,
  now,
  busy,
  act,
  onOpenActivity,
}: {
  alarm: DesktopAlarm;
  now: number;
  busy: boolean;
  act: AlarmAction;
  onOpenActivity?: (id: string) => void;
}) {
  return (
    <Card
      as="article"
      className={`desktop-alarm ${alarm.state}`}
      aria-label={alarm.title}
      data-desktop-resource={alarm.id}
      tabIndex={-1}
    >
      <div className="desktop-alarm-copy">
        <div className="desktop-alarm-heading">
          <h3>{alarm.title}</h3>
          <Badge tone={alarmTone(alarm)}>{alarmLabel(alarm)}</Badge>
        </div>
        {alarm.message !== alarm.title && <p>{alarm.message}</p>}
        <p className="desktop-alarm-meta">{alarmMeta(alarm)}</p>
      </div>
      {alarm.kind === 'timer' && (
        <output aria-label="Time remaining" className="desktop-countdown">
          {countdown(alarm, now)}
        </output>
      )}
      {alarm.notificationError && (
        <div className="desktop-alarm-notice">
          <Notice tone="warning">
            Desktop notification unavailable: {alarm.notificationError}
          </Notice>
        </div>
      )}
      <AlarmActions alarm={alarm} busy={busy} act={act} onOpenActivity={onOpenActivity} />
    </Card>
  );
}
export function DesktopTimers({
  snapshot,
  onAction,
  onOpenActivity,
  selectedResourceId,
}: {
  snapshot: DesktopAlarmSnapshot;
  onAction: (request: DesktopTimeFilesRequest) => Promise<unknown>;
  onOpenActivity?: (id: string) => void;
  selectedResourceId?: string;
}) {
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<AlarmKind>();
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  async function act(request: DesktopTimeFilesRequest) {
    setBusy(true);
    setError('');
    try {
      await onAction(request);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function create(kind: AlarmKind) {
    setError('');
    setCreating(kind);
  }
  // A Context link may intentionally reopen a dismissed alarm's receipt.
  const alarms = snapshot.alarms.filter(
    (alarm) => alarm.id === selectedResourceId || !['dismissed', 'cancelled'].includes(alarm.state),
  );
  return (
    <section className="desktop-timers" aria-label="Desktop timers and reminders">
      <SectionHeader
        title="Timers and reminders"
        description="Countdowns and reminders for your work."
        actions={
          <>
            <Button size="small" icon={<Icon name="plus" />} onClick={() => create('reminder')}>
              New reminder
            </Button>
            <Button
              size="small"
              variant="primary"
              icon={<Icon name="plus" />}
              onClick={() => create('timer')}
            >
              New timer
            </Button>
          </>
        }
      />
      {creating && (
        <AlarmEditor
          kind={creating}
          busy={busy}
          error={error}
          onCreate={act}
          close={() => setCreating(undefined)}
        />
      )}
      {error && !creating && <Notice tone="danger">{error}</Notice>}
      {!alarms.length && (
        <div className="desktop-alarm-empty">
          <EmptyState
            title="Nothing counting down"
            description="Start a timer here, or ask for a reminder in chat."
          />
        </div>
      )}
      <div className="desktop-alarm-list">
        {alarms.map((alarm) => (
          <AlarmCard
            key={alarm.id}
            alarm={alarm}
            now={now}
            busy={busy}
            act={act}
            onOpenActivity={onOpenActivity}
          />
        ))}
      </div>
      <details className="desktop-alarm-availability">
        <summary>When alerts appear</summary>
        <p>{snapshot.availability}</p>
      </details>
    </section>
  );
}
