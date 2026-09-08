import { expect, test, vi } from 'vitest';
import { Activities } from '../../src/main/activities';
import { Store } from '../../src/main/store';
import type { Runtime } from '../../src/main/runtime';
import type { Browsers } from '../../src/main/browser';
import type { Fused } from '../../src/main/fused';

function setup() {
  const store = new Store('/unused');
  store.state.settings.models = ['test'];
  vi.spyOn(store, 'save').mockResolvedValue();
  const requests: { prompt: string; finish: () => void }[] = [];
  const runtime = {
    ensure: async () => {},
    request: async () => Response.json({ id: 'session' }),
    stream: async (_session: string, prompt: string, _metadata: unknown, signal: AbortSignal) =>
      new Promise((resolve, reject) => {
        const abort = () => reject(new Error('Aborted'));
        requests.push({ prompt, finish: () => {
          signal.removeEventListener('abort', abort);
          resolve({ type: 'response.completed', status: 'completed', outputText: 'Done' });
        } });
        signal.addEventListener('abort', abort, { once: true });
      }),
  } as unknown as Runtime;
  return { store, requests, activities: new Activities(store, runtime, () => {}, {} as Browsers, {} as Fused) };
}

test('messages queue without interrupting a response and execute in FIFO order', async () => {
  const { store, requests, activities } = setup();
  const id = await activities.start({ prompt: 'First', model: 'test' });
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  await activities.start({ activityId: id, prompt: 'Second', model: 'test' });
  await activities.start({ activityId: id, prompt: 'Third', model: 'test' });
  expect(requests).toHaveLength(1);
  expect(store.state.activities[0].queue?.map(item => item.prompt)).toEqual(['Second', 'Third']);
  requests[0].finish();
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1].prompt).toBe('Second');
  requests[1].finish();
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[2].prompt).toBe('Third');
  requests[2].finish();
  await vi.waitFor(() => expect(store.state.activities[0].status).toBe('completed'));
  expect(store.state.activities[0].queue).toEqual([]);
});

test('stopping a response preserves and pauses queued messages', async () => {
  const { store, requests, activities } = setup();
  const id = await activities.start({ prompt: 'First', model: 'test' });
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  await activities.start({ activityId: id, prompt: 'Second', model: 'test' });
  await activities.cancel(id);
  await vi.waitFor(() => expect(store.state.activities[0].status).toBe('cancelled'));
  expect(requests).toHaveLength(1);
  expect(store.state.activities[0].queue?.[0].prompt).toBe('Second');
});
