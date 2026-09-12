import { afterEach, expect, test, vi } from 'vitest';
import { ActivityNotifications } from '../../src/main/activity-notifications';
import type { Activity } from '../../src/shared/types';

afterEach(() => vi.useRealTimers());

test('a worker question notifies the owner through the parent chat before completion', async () => {
  const parent = chat('parent');
  const f = fixture([parent]);
  parent.questions = [
    {
      id: 'q1',
      activityId: 'worker',
      sourceTitle: 'Research the audience',
      form: {},
      status: 'pending',
    },
  ];
  f.service.update([parent]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: 'An agent has a question',
      target: { kind: 'activity', activityId: 'parent' },
    }),
  );
  f.service.update([parent]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledOnce();
});
function chat(id: string, status: Activity['status'] = 'running'): Activity {
  return {
    id,
    title: `work ${id}`,
    status,
    model: 'test',
    ollamaUrl: '',
    events: [],
    messages: [{ id: 'turn-1', role: 'user', content: 'Do the work', model: 'test' }],
  };
}
function fixture(initial: Activity[] = []) {
  vi.useFakeTimers();
  let selected: string | undefined;
  let focused = true;
  const notify = vi.fn().mockResolvedValue({});
  const service = new ActivityNotifications(
    initial,
    (id) => focused && selected === id,
    notify,
    vi.fn(),
  );
  return {
    service,
    notify,
    select: (id?: string) => {
      selected = id;
    },
    focus: (value: boolean) => {
      focused = value;
    },
  };
}

test('a completed background chat alerts once, while selected chats and historical results stay quiet', async () => {
  const a = chat('a');
  const b = chat('b');
  const f = fixture([a, b, chat('history', 'completed')]);
  f.select('b');
  a.status = 'completed';
  b.status = 'completed';
  f.service.update([a, b, chat('history', 'completed')]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      title: 'Chat finished',
      target: { kind: 'activity', activityId: 'a' },
    }),
  );
  f.service.update([a, b, chat('history', 'completed')]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledOnce();
});

test('completion alerts when the app is not focused, and rechecks visibility before sending', async () => {
  const a = chat('a');
  const f = fixture([a]);
  f.select('a');
  f.focus(false);
  a.status = 'completed';
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledOnce();
  const b = chat('b', 'completed');
  f.service.update([a, b]);
  f.focus(true);
  f.select('b');
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledOnce();
});

test('local approvals, plan review, failures and connection errors alert without streaming duplicates', async () => {
  const a = chat('a');
  const f = fixture([a]);
  a.approval = { id: 'consent', capability: 'browser', description: 'Open page', arguments: '{}' };
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledOnce();
  delete a.approval;
  a.status = 'awaiting_plan';
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  a.status = 'failed';
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  a.status = 'running';
  a.error = 'Connection lost';
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify.mock.calls.map(([item]) => item.title)).toEqual([
    'Approval needed',
    'Plan ready for review',
    'Chat failed',
    'Chat needs attention',
  ]);
});

test('new turns get distinct event keys; reminders, cancellations, archived chats and worker completions do not alert', async () => {
  const a = chat('a');
  const f = fixture([a]);
  a.status = 'completed';
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  a.messages.push({
    id: 'reminder',
    role: 'assistant',
    content: 'Reminder',
    model: '',
    reminder: { scheduleId: 'job', deliveredAt: new Date().toISOString() },
  });
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledOnce();
  a.messages.push({ id: 'turn-2', role: 'user', content: 'Again', model: 'test' });
  f.service.update([a]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify.mock.calls[0][0].key).not.toBe(f.notify.mock.calls[1][0].key);
  f.service.update([
    a,
    chat('cancelled', 'cancelled'),
    { ...chat('archived', 'completed'), archived: true },
    { ...chat('worker', 'completed'), parentId: 'a' },
  ]);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledTimes(2);
  const c = chat('new', 'completed');
  f.service.update([c]);
  f.service.dispose();
  await vi.advanceTimersByTimeAsync(500);
  expect(f.notify).toHaveBeenCalledTimes(2);
});
