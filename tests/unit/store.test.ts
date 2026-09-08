import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/main/store';
it('restores work as interrupted without reusing a dead runtime session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-store-'));
  try {
    const store = new Store(directory);
    await store.load();
    store.state.activities.push({
      id: 'activity-1',
      title: 'Work',
      model: 'local',
      ollamaUrl: 'http://localhost:11434',
      messages: [],
      events: [],
      status: 'running',
      runtimeSessionId: 'dead-session',
    });
    await store.save();
    const restored = new Store(directory);
    await restored.load();
    expect(restored.state.activities[0].status).toBe('interrupted');
    expect(restored.state.activities[0].runtimeSessionId).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('migrates the existing Fused connection and retains its encrypted token reference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-fused-migration-'));
  try {
    const old = new Store(directory);
    old.state.fused = { enabled: true, url: 'https://example.com/mcp', hasToken: true };
    await old.save();
    const restored = new Store(directory);
    await restored.load();
    expect(restored.state.fusedIntegrations).toEqual([{ id: 'legacy-fused', name: 'Fused', revision: 'legacy', secretId: 'legacy', ...old.state.fused }]);
    restored.state.fusedIntegrations = [];
    await restored.save();
    const reopened = new Store(directory);
    await reopened.load();
    expect(reopened.state.fusedIntegrations).toEqual([]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('restores browser bookmarks as reopenable pages and migrates previous visible pages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-browser-bookmarks-'));
  try {
    const store = new Store(directory);
    await store.load();
    const chat = (id: string) => ({ id, title: 'Browser chat', model: 'local', ollamaUrl: '', messages: [], events: [], status: 'completed' as const });
    store.state.activities = [
      { ...chat('one'), browser: { url: 'https://example.com/saved', needsReopen: false } },
      { ...chat('two'), context: [{ id: 'visited', kind: 'url', name: 'Site', location: 'https://example.com/visited', status: 'visited' }] },
      { ...chat('three'), browser: { url: 'file:///etc/passwd', needsReopen: false } },
      chat('four'),
    ];
    store.state.browser = { activityId: 'four', url: 'https://example.com/current' } as typeof store.state.browser;
    await store.save();
    const restored = new Store(directory);
    await restored.load();
    expect(restored.state.browser).toBeUndefined();
    expect(restored.state.activities.map(activity => activity.browser && ({ url: activity.browser.url, needsReopen: activity.browser.needsReopen }))).toEqual([
      { url: 'https://example.com/saved', needsReopen: true },
      { url: 'https://example.com/visited', needsReopen: true },
      undefined,
      { url: 'https://example.com/current', needsReopen: true },
    ]);
    expect(restored.state.activities[0].browser?.tabs).toEqual([{ id: 'one', activityId: 'one', title: 'example.com', url: 'https://example.com/saved', needsReopen: true }]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
