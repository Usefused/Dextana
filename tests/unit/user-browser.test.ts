import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { UserBrowser } from '../../src/main/user-browser';
import { browserArguments } from '../../src/main/user-browser/actions';
import { extensionId } from '../../src/main/user-browser/protocol';
import manifest from '../../browser-extension/manifest.json';

const origin = `chrome-extension://${extensionId(manifest.key)}`;
const browsers: UserBrowser[] = [];
afterEach(() => {
  for (const browser of browsers.splice(0)) browser.close();
});
async function fixture() {
  const browser = new UserBrowser(origin, () => {});
  browsers.push(browser);
  const pairing = await browser.begin('chat', 'Browser work');
  const [port, token] = pairing.code.split('.');
  const base = `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${token}`, Origin: origin };
  const request = (path: string, body?: unknown) =>
    fetch(base + path, {
      headers,
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const tabId = randomUUID();
  const secondId = randomUUID();
  const tabs = [
    { id: tabId, title: 'Fixture', url: 'https://example.com/form' },
    { id: secondId, title: 'Second', url: 'https://other.example/' },
  ];
  const attach = () =>
    request('/attach', { protocol: 4, scope: 'tabs', approved: true, allowNewTabs: true, tabs });
  const run = (args: Record<string, unknown>, signal = new AbortController().signal) =>
    browser.execute('chat', browser.prepare('chat', args), signal);
  return { browser, pairing, base, headers, request, attach, run, tabId, secondId, tabs };
}
it('authenticates the bundled extension and excludes secrets from snapshots', async () => {
  const f = await fixture();
  for (const headers of [
    {},
    { ...f.headers, Origin: 'https://example.com' },
    { ...f.headers, Origin: `chrome-extension://${'a'.repeat(32)}` },
  ])
    expect((await fetch(f.base + '/request', { headers })).status).toBe(403);
  const rebinding = await new Promise((resolve) => {
    const req = httpRequest(
      f.base + '/request',
      { headers: { ...f.headers, Host: 'example.com' } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.end();
  });
  expect(rebinding).toBe(403);
  expect((await f.request('/request')).status).toBe(200);
  expect(
    (
      await fetch(f.base + '/attach', {
        method: 'POST',
        headers: { Authorization: f.headers.Authorization },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect(JSON.stringify(f.browser.snapshot())).not.toContain(f.pairing.code.split('.')[1]);
});
it('requires explicit attachment once and binds actions to the owning chat/tab/website', async () => {
  const f = await fixture();
  expect(() => f.browser.prepare('chat', { action: 'read' })).toThrow('Attach');
  expect(
    (await f.request('/attach', { approved: false, title: 'Fixture', url: 'https://example.com' }))
      .status,
  ).toBe(400);
  expect((await f.attach()).status).toBe(200);
  expect((await f.attach()).status).toBe(400);
  expect(() => f.browser.prepare('other-chat', { action: 'read' })).toThrow();
  expect(() => f.browser.prepare('chat', { action: 'read', tab_id: 'other-tab' })).toThrow();
  expect(() =>
    f.browser.prepare('chat', { action: 'open', url: 'https://other.example/' }),
  ).not.toThrow();
});
it('delivers commands once, rejects mismatched results and strips unknown result fields', async () => {
  const f = await fixture();
  await f.attach();
  const pending = f.run({ action: 'read', script: 'untrusted', method: 'Runtime.evaluate' });
  const { command } = await (await f.request('/next')).json();
  expect(await (await f.request('/active?requestId=' + command.requestId)).json()).toEqual({
    requestId: command.requestId,
  });
  expect(command.arguments).not.toHaveProperty('script');
  expect(command.arguments).not.toHaveProperty('_userConnection');
  expect(await (await f.request('/next')).json()).toEqual({});
  expect((await f.request('/result', { requestId: 'wrong', value: {} })).status).toBe(400);
  const body = {
    requestId: command.requestId,
    value: {
      text: 'Ready',
      url: 'https://example.com/form',
      secret: 'discard',
      _userConnection: 'forged',
    },
  };
  expect((await f.request('/result', body)).status).toBe(200);
  expect(await pending).toMatchObject({ browser: 'user', text: 'Ready', tab_id: f.tabId });
  expect(await pending).not.toHaveProperty('secret');
  expect(await (await f.request('/active?requestId=' + command.requestId)).json()).toEqual({
    requestId: null,
  });
  expect((await f.request('/result', body)).status).toBe(400);
});
it('allows observation to refresh same-website navigation and invalidates older approvals', async () => {
  const f = await fixture();
  await f.attach();
  const old = f.browser.prepare('chat', { action: 'press', key: 'Enter' });
  const pending = f.run({ action: 'read' });
  const { command } = await (await f.request('/next')).json();
  await f.request('/result', {
    requestId: command.requestId,
    value: { url: 'https://example.com/next', title: 'Next page' },
  });
  await pending;
  expect(() => f.browser.execute('chat', old, new AbortController().signal)).toThrow(
    'page changed',
  );
  expect(f.browser.snapshot()[0].tabs[0].title).toBe('Next page');
});
it('stops on non-website results without accepting them', async () => {
  const f = await fixture();
  await f.attach();
  const pending = f.run({ action: 'read' });
  const rejected = expect(pending).rejects.toThrow();
  const { command } = await (await f.request('/next')).json();
  await f.request('/result', {
    requestId: command.requestId,
    value: { url: 'file:///private/file' },
  });
  await rejected;
  expect(f.browser.snapshot()[0].state).toBe('stopped');
});
it('cancellation rejects pending work and never falls back to an isolated browser', async () => {
  const f = await fixture();
  await f.attach();
  const controller = new AbortController();
  const pending = f.run({ action: 'press', key: 'Enter' }, controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  await f.request('/next');
  controller.abort();
  await rejected;
  expect(f.browser.has('chat')).toBe(true);
  expect(f.browser.prepare('chat', { action: 'read' })).toMatchObject({
    _userConnection: f.pairing.id,
  });
  expect(await (await f.request('/active?requestId=cancelled')).json()).toEqual({
    requestId: null,
  });
  f.browser.reset('chat');
  expect(f.browser.has('chat')).toBe(false);
});
it('keeps browser pairing available after a task finishes', async () => {
  const f = await fixture();
  await f.attach();
  f.browser.release('chat');
  expect(f.browser.snapshot()[0].state).toBe('connected');
  await f.run({ action: 'list_tabs' });
  f.browser.release('chat');
  expect(f.browser.snapshot()[0].state).toBe('connected');
});
it('rejects an action approved for a replaced connection', async () => {
  const f = await fixture();
  await f.attach();
  const old = f.browser.prepare('chat', { action: 'read' });
  f.browser.stop('chat');
  await f.browser.begin('chat', 'Replacement');
  expect(() => f.browser.execute('chat', old, new AbortController().signal)).toThrow('replaced');
});
it.each([
  { action: 'read', limit: 1001 },
  { action: 'read', offset: 1.5 },
  { action: 'click', x: 10, y: 10 },
  { action: 'click', ref: 'guessed' },
  { action: 'scroll', x: -1 },
  { action: 'press', key: 'Copy' },
  { action: 'open', url: 'javascript:alert(1)' },
  { action: 'new_tab' },
  { action: 'toString' },
])('rejects unsupported or unbounded inputs: %j', (args) =>
  expect(() => browserArguments(args)).toThrow(),
);

it('runs different tabs concurrently, scopes references, and rejects same-tab overlap', async () => {
  const f = await fixture();
  await f.attach();
  const a = f.run({ action: 'read', tab_id: f.tabId });
  const b = f.run({ action: 'read', tab_id: f.secondId });
  expect(() => f.run({ action: 'read', tab_id: f.tabId })).toThrow('already working');
  const { command: first } = await (await f.request('/next')).json();
  const { command: second } = await (await f.request('/next')).json();
  const refA = `${randomUUID()}:1`;
  const refB = `${randomUUID()}:1`;
  await f.request('/result', {
    requestId: second.requestId,
    value: { url: f.tabs[1].url, elements: [{ ref: refB, label: 'Second input' }] },
  });
  expect(await b).toMatchObject({ tab_id: f.secondId });
  await f.request('/result', {
    requestId: first.requestId,
    value: { url: f.tabs[0].url, elements: [{ ref: refA, label: 'First input' }] },
  });
  expect(await a).toMatchObject({ tab_id: f.tabId });
  expect(() =>
    f.browser.prepare('chat', { action: 'fill', tab_id: f.secondId, ref: refA, text: 'wrong' }),
  ).toThrow('current element');
  expect(
    f.browser.prepare('chat', { action: 'fill', tab_id: f.tabId, ref: refA, text: 'correct' }),
  ).toMatchObject({ _userTarget: 'First input' });
});
it('accepts fresh input-result references without another read and rejects replaced references', async () => {
  const f = await fixture();
  await f.attach();
  const oldRef = `${randomUUID()}:1`;
  const newRef = `${randomUUID()}:1`;
  const reading = f.run({ action: 'read', tab_id: f.tabId });
  const { command: read } = await (await f.request('/next')).json();
  await f.request('/result', {
    requestId: read.requestId,
    value: { url: f.tabs[0].url, elements: [{ ref: oldRef, label: 'Email' }] },
  });
  await reading;
  const filling = f.run({ action: 'fill', tab_id: f.tabId, ref: oldRef, text: 'alex@example.com' });
  const { command: fill } = await (await f.request('/next')).json();
  await f.request('/result', {
    requestId: fill.requestId,
    value: { url: f.tabs[0].url, elements: [{ ref: newRef, label: 'Save profile' }] },
  });
  await filling;
  expect(() =>
    f.browser.prepare('chat', { action: 'click', tab_id: f.tabId, ref: oldRef }),
  ).toThrow('current element');
  expect(
    f.browser.prepare('chat', { action: 'click', tab_id: f.tabId, ref: newRef }),
  ).toMatchObject({ _userTarget: 'Save profile' });
});
it('closing one tab rejects only its pending action and never redirects its handle', async () => {
  const f = await fixture();
  await f.attach();
  const a = f.run({ action: 'read', tab_id: f.tabId });
  const rejected = expect(a).rejects.toThrow('closed');
  const b = f.run({ action: 'read', tab_id: f.secondId });
  const { command: first } = await (await f.request('/next')).json();
  const { command: second } = await (await f.request('/next')).json();
  await f.request('/tabs', { revision: 1, tabs: [{ ...f.tabs[0], state: 'closed' }, f.tabs[1]] });
  await rejected;
  expect((await f.request('/result', { requestId: first.requestId, value: {} })).status).toBe(400);
  await f.request('/result', { requestId: second.requestId, value: { text: 'Still here' } });
  expect(await b).toMatchObject({ text: 'Still here' });
  expect(() => f.browser.prepare('chat', { action: 'read', tab_id: f.tabId })).toThrow('closed');
  expect(f.browser.snapshot()[0].state).toBe('connected');
});
it('new-tab approvals are single-use and only created tabs may be closed by the agent', async () => {
  const f = await fixture();
  await f.attach();
  expect(() => f.browser.prepare('chat', { action: 'close_tab', tab_id: f.tabId })).toThrow(
    'Dext-created',
  );
  const args = f.browser.prepare('chat', { action: 'new_tab', url: 'https://third.example' });
  const signal = new AbortController().signal;
  const pending = f.browser.execute('chat', args, signal);
  expect(() => f.browser.execute('chat', args, signal)).toThrow('already used');
  const { command } = await (await f.request('/next')).json();
  await f.request('/result', {
    requestId: command.requestId,
    value: { url: 'https://third.example/', title: 'Third' },
  });
  await pending;
  expect(await f.run({ action: 'list_tabs' })).toMatchObject({
    tabs: expect.arrayContaining([
      { tab_id: args.tab_id, url: 'https://third.example/', title: 'Third', created: true },
    ]),
  });
  expect(f.browser.prepare('chat', { action: 'close_tab', tab_id: args.tab_id }).tab_id).toBe(
    args.tab_id,
  );
  expect(() => f.browser.execute('chat', args, signal)).toThrow('already used');
});
it('late observations cannot overwrite a newer navigation or create usable stale refs', async () => {
  const f = await fixture();
  await f.attach();
  const pending = f.run({ action: 'read', tab_id: f.tabId });
  const { command } = await (await f.request('/next')).json();
  await f.request('/tabs', {
    revision: 1,
    tabs: [{ ...f.tabs[0], url: 'https://latest.example/' }],
  });
  const ref = `${randomUUID()}:1`;
  await f.request('/result', {
    requestId: command.requestId,
    value: { url: f.tabs[0].url, elements: [{ ref, label: 'Stale' }] },
  });
  expect(await pending).toMatchObject({ error: expect.stringContaining('changed') });
  expect(f.browser.snapshot()[0].tabs[0].url).toBe('https://latest.example/');
  expect(() =>
    f.browser.prepare('chat', { action: 'fill', tab_id: f.tabId, ref, text: 'x' }),
  ).toThrow('current element');
});

it('connects without an existing tab but still requires explicit new-tab authority', async () => {
  const f = await fixture();
  expect(
    (await f.request('/attach', { approved: true, allowNewTabs: false, tabs: [] })).status,
  ).toBe(400);
  expect(
    (
      await f.request('/attach', {
        protocol: 4,
        scope: 'tabs',
        approved: true,
        allowNewTabs: true,
        tabs: [],
      })
    ).status,
  ).toBe(200);
  expect(await f.run({ action: 'list_tabs' })).toMatchObject({ tabs: [] });
  expect(() => f.browser.prepare('chat', { action: 'read' })).toThrow('not attached');
  const prepared = f.browser.prepare('chat', { action: 'new_tab', url: 'https://example.com/' });
  expect(await (await f.request('/next')).json()).toEqual({});
  const pending = f.browser.execute('chat', prepared, new AbortController().signal);
  const { command } = await (await f.request('/next')).json();
  await f.request('/result', {
    requestId: command.requestId,
    value: { title: 'Task tab', url: 'https://example.com/' },
  });
  expect(await pending).toMatchObject({ tab_id: prepared.tab_id });
  expect(f.browser.snapshot()[0].tabs).toHaveLength(1);
});

it('agent connection requests wait for owner attachment and never return the pairing secret', async () => {
  const f = await fixture();
  let returned = false;
  const pending = f.browser
    .request('chat', 'Use Chrome', new AbortController().signal)
    .then((value) => {
      returned = true;
      return value;
    });
  expect(f.browser.snapshot()[0]).toMatchObject({ state: 'waiting', requested: true });
  expect(f.browser.pairing('chat')?.code).toBe(f.pairing.code);
  expect(returned).toBe(false);
  expect(JSON.stringify(f.browser.snapshot())).not.toContain(f.pairing.code);
  await f.attach();
  expect(await pending).toMatchObject({ browser: 'user', tabs: expect.any(Array) });
  expect(JSON.stringify(await pending)).not.toContain(f.pairing.code);
  expect(f.browser.pairing('chat')).toBeUndefined();
  f.browser.release('chat');
  expect(f.browser.snapshot()[0].state).toBe('connected');
});
it('cancelling an agent connection request ends its authority without browser fallback', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const pending = f.browser.request('chat', 'Use Chrome', controller.signal);
  const rejected = expect(pending).rejects.toThrow('cancelled');
  controller.abort();
  await rejected;
  expect(f.browser.snapshot()[0].state).toBe('stopped');
  expect(f.browser.has('chat')).toBe(true);
  expect(f.browser.pairing('chat')).toBeUndefined();
  expect(() => f.browser.prepare('chat', { action: 'read' })).toThrow('Attach');
});

it('keeps an activated pairing beyond fifteen minutes and recovers a missed heartbeat', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const f = await fixture();
  try {
    await f.attach();
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    expect(f.browser.snapshot()[0]).toMatchObject({
      id: f.pairing.id,
      state: 'connected',
      reconnecting: true,
    });
    await f.request('/next');
    expect(f.browser.snapshot()[0]).toMatchObject({
      id: f.pairing.id,
      state: 'connected',
      reconnecting: false,
    });
  } finally {
    f.browser.close();
    vi.useRealTimers();
  }
});

it('reuses only browser-wide grants and releases one chat without cancelling another', async () => {
  const f = await fixture();
  await f.request('/attach', {
    protocol: 4,
    approved: true,
    allowNewTabs: true,
    scope: 'browser',
    tabs: f.tabs,
  });
  await f.browser.request('second', 'Second chat', new AbortController().signal);
  const first = f.run({ action: 'read', tab_id: f.tabId });
  const firstRejected = expect(first).rejects.toThrow('task ended');
  const secondArgs = f.browser.prepare('second', { action: 'read', tab_id: f.secondId });
  const second = f.browser.execute('second', secondArgs, new AbortController().signal);
  const one = (await (await f.request('/next')).json()).command;
  const two = (await (await f.request('/next')).json()).command;
  f.browser.release('chat');
  await firstRejected;
  expect(await (await f.request('/active?requestId=' + one.requestId)).json()).toEqual({
    requestId: null,
  });
  expect(await (await f.request('/active?requestId=' + two.requestId)).json()).toEqual({
    requestId: two.requestId,
  });
  await f.request('/result', {
    requestId: two.requestId,
    value: { title: 'Second tab', url: f.tabs[1].url },
  });
  await expect(second).resolves.toMatchObject({ browser: 'user' });
  expect(f.browser.snapshot().map((state) => state.id)).toEqual([f.pairing.id, f.pairing.id]);
  f.browser.reset('chat');
  expect(f.browser.snapshot()[0].state).toBe('connected');
});

it('does not reuse granular tab grants for another chat', async () => {
  const f = await fixture();
  await f.attach();
  expect(f.browser.reuse('another-chat')).toBe(false);
  expect(f.browser.has('another-chat')).toBe(false);
});

it.each([
  {},
  { protocol: 3, scope: 'browser' },
  { protocol: 4 },
  { protocol: 4, scope: 'unknown' },
])(
  'rejects stale or ambiguous extension grants without silently selecting tabs: %j',
  async (fields) => {
    const f = await fixture();
    const response = await f.request('/attach', {
      approved: true,
      allowNewTabs: true,
      tabs: f.tabs,
      ...fields,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'extension_update_required' });
    expect(f.browser.snapshot()[0]).toMatchObject({ state: 'waiting', tabs: [] });
    await f.request('/attach', {
      protocol: 4,
      scope: 'browser',
      approved: true,
      allowNewTabs: true,
      tabs: f.tabs,
    });
    expect(await f.run({ action: 'list_tabs' })).toMatchObject({
      scope: 'browser',
      coverage: expect.stringContaining('All regular web tabs'),
    });
  },
);

it('reports limited coverage instead of implying a missing tab is not open', async () => {
  const f = await fixture();
  await f.attach();
  expect(await f.run({ action: 'list_tabs' })).toMatchObject({
    scope: 'tabs',
    coverage: expect.stringContaining('outside this grant'),
  });
});

it('keeps existing activation codes and granular connections intact when another chat connects', async () => {
  const f = await fixture();
  expect(await f.browser.begin('chat', 'Same chat')).toEqual(f.pairing);
  await expect(f.browser.begin('another-chat', 'Other chat')).rejects.toThrow('already waiting');
  expect(f.browser.pairing('chat')).toEqual(f.pairing);
  await f.attach();
  expect(f.browser.reuse('chat')).toBe(true);
  await expect(
    f.browser.request('another-chat', 'Other chat', new AbortController().signal),
  ).rejects.toThrow('already active');
  expect(f.browser.snapshot()[0]).toMatchObject({ id: f.pairing.id, state: 'connected' });
  expect(await f.run({ action: 'list_tabs' })).toMatchObject({ tabs: expect.any(Array) });
});

it('shares simultaneous browser-wide activation requests without replacing the connection', async () => {
  const f = await fixture();
  const first = f.browser.request('chat', 'First chat', new AbortController().signal);
  const second = f.browser.request('second', 'Second chat', new AbortController().signal);
  await f.request('/attach', {
    protocol: 4,
    approved: true,
    allowNewTabs: true,
    scope: 'browser',
    tabs: f.tabs,
  });
  await expect(first).resolves.toMatchObject({ browser: 'user' });
  await expect(second).resolves.toMatchObject({ browser: 'user' });
  expect(f.browser.snapshot().map((state) => state.id)).toEqual([f.pairing.id, f.pairing.id]);
});

it('cancels one activation waiter without disconnecting another and enforces granular scope', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const first = f.browser.request('chat', 'First chat', controller.signal);
  const cancelled = expect(first).rejects.toThrow('cancelled');
  const second = f.browser.request('second', 'Second chat', new AbortController().signal);
  const scoped = expect(second).rejects.toThrow('selected tabs to another chat');
  await Promise.resolve();
  controller.abort();
  await cancelled;
  expect(f.browser.snapshot()[0].state).toBe('waiting');
  await f.attach();
  await scoped;
  expect(f.browser.has('second')).toBe(false);
  expect(() => f.browser.prepare('second', { action: 'read' })).toThrow('connection ended');
  expect(f.browser.snapshot()[0].state).toBe('connected');
});

it('keeps the default tab per chat and never redirects a closed default to another chat', async () => {
  const f = await fixture();
  await f.request('/attach', {
    protocol: 4,
    approved: true,
    allowNewTabs: true,
    scope: 'browser',
    tabs: f.tabs,
  });
  await f.browser.request('second', 'Second chat', new AbortController().signal);
  const first = f.run({ action: 'read', tab_id: f.tabId });
  const second = f.browser.execute(
    'second',
    f.browser.prepare('second', {
      action: 'read',
      tab_id: f.secondId,
    }),
    new AbortController().signal,
  );
  for (const tab of f.tabs) {
    const { command } = await (await f.request('/next')).json();
    await f.request('/result', { requestId: command.requestId, value: { url: tab.url } });
  }
  await Promise.all([first, second]);
  expect(f.browser.prepare('chat', { action: 'read' }).tab_id).toBe(f.tabId);
  expect(f.browser.prepare('second', { action: 'read' }).tab_id).toBe(f.secondId);
  f.browser.reuse('chat');
  expect(f.browser.prepare('chat', { action: 'read' }).tab_id).toBe(f.tabId);
  await f.request('/tabs', { revision: 1, tabs: [{ ...f.tabs[0], state: 'closed' }, f.tabs[1]] });
  expect(() => f.browser.prepare('chat', { action: 'read' })).toThrow('closed');
  expect(f.browser.prepare('second', { action: 'read' }).tab_id).toBe(f.secondId);
});
