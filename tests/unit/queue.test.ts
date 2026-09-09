import { expect, test, vi } from 'vitest';
import { Activities } from '../../src/main/activities';
import { Store } from '../../src/main/store';
import type { Runtime } from '../../src/main/runtime';
import type { Browsers } from '../../src/main/browser';
import type { Fused } from '../../src/main/fused';

test('desktop routes queue and steering commands to the backend without starting a model stream', async () => {
  const store = new Store('/unused');
  store.state.settings.models = ['test'];
  vi.spyOn(store, 'save').mockResolvedValue();
  const commands: any[] = [];
  const runtime = {
    ensure: async () => {},
    request: async (path: string, init: RequestInit) => {
      if (path.includes('/events')) return new Promise(() => {});
      commands.push(JSON.parse(init.body as string));
      return Response.json({ revision: commands.length, activities: [], requests: [], result: 'backend-id' });
    },
  } as unknown as Runtime;
  const activities = new Activities(store, runtime, () => {}, {} as Browsers, {} as Fused);
  try {
    expect(await activities.start({ prompt: 'First', model: 'test' })).toBe('backend-id');
    await activities.start({ activityId: 'backend-id', prompt: 'Second', model: 'test' });
    await activities.steer('backend-id', 'queued-message');
    await activities.cancel('backend-id');
    expect(commands.map(c => c.action)).toEqual(['initialize', 'start', 'start', 'steer', 'cancel']);
    expect(commands[3].input).toEqual({ activityId: 'backend-id', messageId: 'queued-message' });
    expect(store.backendOwnsActivities).toBe(true);
  } finally { activities.stopAll(); }
});
