import { expect, test } from 'vitest';
import { desktopActionLabel, desktopReviewFields } from '../../src/shared/desktop-presentation';
import { DesktopContextRecorder } from '../../src/main/desktop/context-recorder';
import { Store } from '../../src/main/store';
import type { Activity } from '../../src/shared/types';
import type { DesktopWatchRule } from '../../src/shared/desktop-workflows';

test('desktop approvals retain meaningful targets but omit transport identifiers', () => {
  const input = {
    id: 'internal-id',
    operation: 'workflow.watch_save',
    folder: '/Invoices',
    prompt: 'Track invoices',
    enabled: true,
    sourceActivityId: 'chat',
    entries: [{ from: '/a.txt', to: '/b.txt', completed: false }],
  };
  expect(desktopReviewFields(input)).toEqual({
    Folder: '/Invoices',
    Instructions: 'Track invoices',
    'Watching enabled': true,
    'File names': [{ 'Current name': '/a.txt', 'New name': '/b.txt' }],
  });
  expect(input.id).toBe('internal-id');
  expect(desktopActionLabel(input.operation)).toBe('Watch a folder');
  expect(desktopReviewFields({ durationSeconds: 1500 })).toEqual({ Duration: '25 minutes' });
});

test('watched folders retain their exact path in Context as status changes', () => {
  const store = new Store('/unused');
  const activity = { id: 'chat', context: [] } as unknown as Activity;
  store.state.activities = [activity];
  const recorder = new DesktopContextRecorder(store);
  const watch = {
    id: 'watch',
    activityId: 'chat',
    name: 'Invoices',
    folder: '/Documents/Invoices',
    status: 'watching',
  } as DesktopWatchRule;
  const snapshot = {
    watches: [watch],
    jobs: [],
    renames: [],
    onBattery: false,
    pauseOnBattery: true,
  };
  recorder.workflows(snapshot);
  const id = activity.context![0].id;
  watch.status = 'paused';
  recorder.workflows(snapshot);
  expect(activity.context).toHaveLength(1);
  expect(activity.context![0]).toMatchObject({
    id,
    desktop: { path: '/Documents/Invoices', state: 'paused' },
  });
});

test('computer context shows app and window, while restart marks former control stopped', () => {
  const store = new Store('/unused');
  const activity = { id: 'chat', context: [] } as unknown as Activity;
  store.state.activities = [activity];
  const recorder = new DesktopContextRecorder(store);
  recorder.computer({
    enabled: true,
    selection: {
      id: 'selection',
      activityId: 'chat',
      state: 'ready',
      window: { id: '12:34', pid: 12, windowId: 34, application: 'TextEdit', title: 'Brief.txt' },
    },
  });
  expect(activity.context![0]).toMatchObject({
    name: 'TextEdit',
    desktop: { work: 'computer', path: 'Brief.txt', state: 'ready' },
  });
  recorder.resetComputer();
  expect(activity.context![0].desktop?.state).toBe('stopped');
  expect(
    desktopReviewFields({
      application: 'TextEdit',
      window: 'Brief.txt',
      selectionId: 'secret',
      snapshotId: 'secret',
      elementIndex: 3,
    }),
  ).toEqual({ Application: 'TextEdit', Window: 'Brief.txt' });
});
