import { expect, test, vi } from 'vitest';
import { Activities } from '../../src/main/activities';
import { Store } from '../../src/main/store';
import type { Runtime } from '../../src/main/runtime';
import type { Browsers } from '../../src/main/browser';
import type { Fused } from '../../src/main/fused';

test('a busy snapshot endpoint preserves pending local consent and never dispatches twice', async () => {
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const activity = { id: 'worker', title: 'Worker', parentId: 'parent', status: 'running', model: 'test', ollamaUrl: '', messages: [], events: [] };
  const requests = [{ id: 'request', activityId: 'worker', kind: 'tool', payload: { name: 'browser', arguments: { action: 'open', url: 'https://example.com' } } }];
  const execute = vi.fn().mockResolvedValue({});
  let polls = 0;
  const runtime = {
    ensure: async () => {},
    request: async (path: string) => {
      if (path.includes('/command')) return Response.json({ revision: 1, activities: [activity], requests: [] });
      if (path.includes('/events')) {
        if (++polls === 1) return Response.json({ revision: 2, activities: [activity], requests });
        if (polls === 2) return new Response('Service Unavailable', { status: 503 });
        return new Promise(() => {});
      }
      return Response.json({ ok: true });
    },
  } as unknown as Runtime;
  const activities = new Activities(store, runtime, () => {}, { prepare: (_: string, args: unknown) => args, execute } as unknown as Browsers, {} as Fused);
  try {
    await activities.initialize();
    await vi.waitFor(() => expect(polls).toBe(2));
    const pending = store.state.activities[0].approval;
    expect(pending).toBeDefined();
    expect(execute).not.toHaveBeenCalled();
    // Even a repeated snapshot cannot create another local gate or action.
    (activities as any).apply({ revision: 2, activities: [structuredClone(activity)], requests });
    expect(store.state.activities[0].approval?.id).toBe(pending?.id);
    await activities.approve({ activityId: 'worker', approvalId: pending!.id, approved: true });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
  } finally { activities.stopAll(); }
});
