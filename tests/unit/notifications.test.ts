import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, vi } from 'vitest';
import { Notifications } from '../../src/main/notifications';
import { Store } from '../../src/main/store';
import type { AppNotification } from '../../src/shared/notifications';

function fixture() {
  let items: AppNotification[] = [];
  const host = {
    get: () => items,
    set: (value: AppNotification[]) => {
      items = value;
    },
    save: vi.fn(async () => {}),
    changed: vi.fn(),
    isFocused: vi.fn(() => true),
    showNative: vi.fn(),
    open: vi.fn(),
    failed: vi.fn(),
  };
  return { host, service: new Notifications(host) };
}
const input = {
  source: 'Importer',
  title: 'Import complete',
  body: 'Your files are ready.',
  key: 'import-1',
};

test('visible pages keep events as read history without banners or OS alerts', async () => {
  const { host, service } = fixture();
  await service.command({ action: 'view', view: { page: 'time' } });
  const alarm = await service.send({ ...input, page: 'time' });
  expect(alarm.readAt).toBeTruthy();
  expect(host.showNative).not.toHaveBeenCalled();
  expect(host.get()[0].dismissedAt).toBeUndefined();

  // A notification's destination may be a chat, while its result is also on a page.
  const workflow = await service.send({
    ...input,
    key: 'workflow',
    page: 'workflows',
    target: { kind: 'activity', activityId: 'chat-1' },
  });
  expect(workflow.readAt).toBeUndefined();
  expect(host.showNative).toHaveBeenCalledOnce();
  await service.command({ action: 'view', view: { page: 'workflows' } });
  expect(host.get()[0].readAt).toBeTruthy();
  await service.command({
    action: 'view',
    view: { page: 'chat', target: { kind: 'activity', activityId: 'chat-1' } },
  });
  const reminder = await service.send({
    ...input,
    key: 'reminder',
    page: 'time',
    target: { kind: 'desktop', resourceId: 'reminder', activityId: 'chat-1' },
  });
  expect(reminder.readAt).toBeTruthy();
  expect(host.showNative).toHaveBeenCalledOnce();
});

test('unfocused pages alert, refocusing acknowledges them, and leaving restores delivery', async () => {
  const { host, service } = fixture();
  await service.command({ action: 'view', view: { page: 'time' } });
  host.isFocused.mockReturnValue(false);
  const alarm = await service.send({ ...input, page: 'time' });
  expect(alarm.readAt).toBeUndefined();
  await service.refreshVisibility();
  expect(host.get()[0].readAt).toBeUndefined();
  host.isFocused.mockReturnValue(true);
  await service.refreshVisibility();
  expect(host.get()[0].readAt).toBeTruthy();
  await service.command({ action: 'view' });
  const next = await service.send({ ...input, key: 'next', page: 'time' });
  expect(next.readAt).toBeUndefined();
  expect(host.showNative).toHaveBeenCalledTimes(2);
});

test('queued notifications use the latest page and focus when delivered', async () => {
  const { host, service } = fixture();
  let saved!: () => void;
  host.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  const first = service.send(input);
  await vi.waitFor(() => expect(saved).toBeTypeOf('function'));
  const next = service.send({ ...input, key: 'queued', page: 'time' });
  const viewing = service.command({ action: 'view', view: { page: 'time' } });
  saved();
  await Promise.all([first, viewing]);
  expect((await next).readAt).toBeTruthy();
  expect(host.showNative).toHaveBeenCalledOnce();
});

test('concurrent service events are serialized and deduplicated by source and event', async () => {
  const { host, service } = fixture();
  const [a, duplicate, b] = await Promise.all([
    service.send(input),
    service.send(input),
    service.send({ ...input, source: 'Indexer' }),
  ]);
  expect(a.id).toBe(duplicate.id);
  expect(b.id).not.toBe(a.id);
  expect(host.get()).toHaveLength(2);
  expect(host.showNative).toHaveBeenCalledTimes(2);
  await service.command({ action: 'dismiss', id: a.id });
  expect((await service.send(input)).dismissedAt).toBeTruthy();
  expect(host.showNative).toHaveBeenCalledTimes(2);
});

test('OS delivery failure preserves the inbox and native clicks use the same read/open route', async () => {
  const { host, service } = fixture();
  host.showNative.mockImplementationOnce(() => {
    throw new Error('Notifications disabled');
  });
  const a = await service.send(input);
  expect(host.get()[0].id).toBe(a.id);
  const b = await service.send({
    ...input,
    key: 'second',
    target: { kind: 'desktop', resourceId: 'timer' },
  });
  const click = host.showNative.mock.calls.at(-1)![1] as () => void;
  click();
  await vi.waitFor(() => expect(host.open).toHaveBeenCalledOnce());
  expect(host.get().find((item) => item.id === b.id)?.readAt).toBeTruthy();
  expect(host.open.mock.calls[0][0].target).toEqual({ kind: 'desktop', resourceId: 'timer' });
  await service.send({ ...input, key: 'quiet', native: false });
  expect(host.showNative).toHaveBeenCalledTimes(2);
});

test('storage failure rolls back, does not alert, and later sends still work', async () => {
  const { host, service } = fixture();
  host.save.mockRejectedValueOnce(new Error('Disk full'));
  await expect(service.send(input)).rejects.toThrow('Disk full');
  expect(host.get()).toEqual([]);
  expect(host.showNative).not.toHaveBeenCalled();
  await service.send(input);
  await expect(service.command({ action: 'open', id: 'missing' })).rejects.toThrow(
    'no longer available',
  );
  expect(host.open).not.toHaveBeenCalled();
});

test('viewing a reminder or its chat reads only related alerts without dismissing them', async () => {
  const { host, service } = fixture();
  const reminder = await service.send({
    ...input,
    key: 'reminder',
    target: { kind: 'desktop', resourceId: 'reminder-1', activityId: 'chat-1' },
  });
  const other = await service.send({
    ...input,
    key: 'other',
    target: { kind: 'desktop', resourceId: 'reminder-2', activityId: 'chat-2' },
  });
  const chat = await service.send({
    ...input,
    key: 'chat',
    target: { kind: 'activity', activityId: 'chat-1' },
  });
  const related = await service.send({
    ...input,
    key: 'related',
    target: { kind: 'desktop', resourceId: 'reminder-3', activityId: 'chat-1' },
  });
  const untargeted = await service.send(input);
  const readIds = () =>
    host
      .get()
      .filter((item) => item.readAt)
      .map((item) => item.id);

  await service.command({
    action: 'readTarget',
    target: { kind: 'desktop', resourceId: 'reminder-1' },
  });
  expect(readIds()).toEqual([reminder.id]);
  await service.command({
    action: 'readTarget',
    target: { kind: 'activity', activityId: 'chat-1' },
  });
  expect(readIds()).toEqual([related.id, chat.id, reminder.id]);
  expect(
    host
      .get()
      .filter((item) => !item.readAt)
      .map((item) => item.id),
  ).toEqual([untargeted.id, other.id]);
  expect(host.get().some((item) => item.dismissedAt)).toBe(false);
  expect(host.open).not.toHaveBeenCalled();

  host.save.mockClear();
  host.changed.mockClear();
  await service.command({
    action: 'readTarget',
    target: { kind: 'activity', activityId: 'chat-1' },
  });
  await service.command({ action: 'readTarget', target: { kind: 'desktop' } });
  expect(host.save).not.toHaveBeenCalled();
  expect(host.changed).not.toHaveBeenCalled();
});

test('notifications and read/dismiss state reuse existing storage without replaying OS alerts after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-notifications-'));
  try {
    const store = new Store(directory);
    await store.load();
    const native = vi.fn();
    const attach = (store: Store) =>
      new Notifications({
        get: () => store.state.notifications ?? [],
        set: (items) => {
          store.state.notifications = items;
        },
        save: () => store.save(),
        changed: () => {},
        showNative: native,
        open: () => {},
        failed: () => {},
      });
    const service = attach(store);
    const a = await service.send(input);
    const b = await service.send({ ...input, key: 'second' });
    await service.command({ action: 'readAll' });
    await service.command({ action: 'dismiss', id: b.id });
    const reopened = new Store(directory);
    await reopened.load();
    const resumed = attach(reopened);
    expect(reopened.state.notifications?.every((item) => item.readAt)).toBe(true);
    expect(
      reopened.state.notifications?.find((item) => item.id === b.id)?.dismissedAt,
    ).toBeTruthy();
    expect((await resumed.send(input)).id).toBe(a.id);
    expect(native).toHaveBeenCalledTimes(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('history remains bounded and callers cannot mutate a stored notification', async () => {
  const { host, service } = fixture();
  for (let i = 0; i < 205; i++) await service.send({ ...input, key: String(i), native: false });
  expect(host.get()).toHaveLength(200);
  const result = await service.send({ ...input, key: '204' });
  result.body = 'changed';
  expect(host.get()[0].body).toBe(input.body);
});
