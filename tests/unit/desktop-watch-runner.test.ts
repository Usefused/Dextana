import { expect, test, vi } from 'vitest';
import type { Activities } from '../../src/main/activities';
import type { Activity } from '../../src/shared/types';
import { Store } from '../../src/main/store';
import { createWatchRunner } from '../../src/main/desktop/watch-runner';

test('a removed workflow chat fails promptly instead of polling forever', async () => {
  const store = new Store('/unused');
  store.state.activities = [{ id: 'origin', title: 'Invoices', model: 'test' } as Activity];
  const activities = { start: vi.fn().mockResolvedValue('removed-chat'), cancel: vi.fn() };
  const run = createWatchRunner(store, () => activities as unknown as Activities, vi.fn());
  await expect(
    run(
      { ruleId: 'rule', activityId: 'origin', prompt: 'Index invoices', paths: [] },
      new AbortController().signal,
    ),
  ).rejects.toThrow('chat no longer exists');
});
