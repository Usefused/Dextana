import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/main/store';
it('preserves completed runtime sessions while retiring interrupted executions', async () => {
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
    store.state.activities.push({
      ...store.state.activities[0],
      id: 'activity-2',
      status: 'completed',
      runtimeSessionId: 'durable-session',
    });
    await store.save();
    const restored = new Store(directory);
    await restored.load();
    expect(restored.state.activities[0].status).toBe('interrupted');
    expect(restored.state.activities[0].runtimeSessionId).toBeUndefined();
    expect(restored.state.activities[1].runtimeSessionId).toBe('durable-session');
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
    expect(restored.state.fusedIntegrations).toEqual([
      {
        id: 'legacy-fused',
        name: 'Fused',
        revision: 'legacy',
        secretId: 'legacy',
        ...old.state.fused,
      },
    ]);
    restored.state.fusedIntegrations = [];
    await restored.save();
    const reopened = new Store(directory);
    await reopened.load();
    expect(reopened.state.fusedIntegrations).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('restores actual browser bookmarks without inventing tabs from chat history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-browser-bookmarks-'));
  try {
    const store = new Store(directory);
    await store.load();
    const chat = (id: string) => ({
      id,
      title: 'Browser chat',
      model: 'local',
      ollamaUrl: '',
      messages: [],
      events: [],
      status: 'completed' as const,
    });
    store.state.activities = [
      { ...chat('one'), browser: { url: 'https://example.com/saved', needsReopen: false } },
      {
        ...chat('two'),
        context: [
          {
            id: 'visited',
            kind: 'url',
            name: 'Site',
            location: 'https://example.com/visited',
            status: 'visited',
          },
        ],
      },
      { ...chat('three'), browser: { url: 'file:///etc/passwd', needsReopen: false } },
      chat('four'),
    ];
    store.state.browser = {
      activityId: 'four',
      url: 'https://example.com/current',
    } as typeof store.state.browser;
    await store.save();
    const restored = new Store(directory);
    await restored.load();
    expect(restored.state.browser).toBeUndefined();
    expect(
      restored.state.activities.map(
        (activity) =>
          activity.browser && {
            url: activity.browser.url,
            needsReopen: activity.browser.needsReopen,
          },
      ),
    ).toEqual([
      { url: 'https://example.com/saved', needsReopen: true },
      undefined,
      undefined,
      { url: 'https://example.com/current', needsReopen: true },
    ]);
    expect(restored.state.activities[0].browser?.tabs).toEqual([
      {
        id: 'one',
        activityId: 'one',
        title: 'example.com',
        url: 'https://example.com/saved',
        needsReopen: true,
      },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('never persists authentication prompts or ephemeral browser URLs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-ephemeral-auth-'));
  try {
    const store = new Store(directory);
    await store.load();
    store.state.mcpAuthentications = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        activityId: 'chat',
        connectionId: 'mcp',
        connectionName: 'Calendar',
        message: 'Connect',
        action: 'connect',
        state: 'waiting',
        retryAllowed: true,
        expiresAt: '2030-01-01T00:00:00Z',
      },
    ];
    store.state.browser = {
      ephemeral: true,
      activityId: 'chat',
      tabId: 'auth',
      url: 'https://provider.example/authorize?secret=one-time',
      tabs: [],
      busyTabIds: [],
    };
    await store.save();
    const data = await readFile(join(directory, 'state.json'), 'utf8');
    expect(data).not.toContain('mcpAuthentications');
    expect(data).not.toContain('one-time');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
