import { test, expect } from '@playwright/test';
import { UserBrowser } from '../../src/main/user-browser';
import { browserFixture } from '../helpers/user-browser';

test('browser-wide activation discovers future tabs, survives task release and reuses pairing across chats', async () => {
  test.setTimeout(90_000);
  const fixture = await browserFixture();
  const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
  const run = (chat: string, args: Record<string, unknown>) =>
    browser.execute(
      chat,
      browser.prepare(chat, args),
      new AbortController().signal,
    ) as Promise<any>;
  try {
    for (let index = 0; index < 12; index++) {
      const page = await fixture.context.newPage();
      await page.goto(`${fixture.origin}/existing-${index}`);
    }
    await fixture.page.locator('#title').fill('Existing application in progress');
    const pairing = await browser.begin('first', 'Browser work');
    const secondConnection = browser.request(
      'second',
      'Follow-up work',
      new AbortController().signal,
    );
    await fixture.attach(pairing.code, 'browser');
    await secondConnection;
    expect(browser.snapshot()[0]).toMatchObject({ scope: 'browser', state: 'connected' });
    expect((await run('first', { action: 'list_tabs' })).tabs).toHaveLength(13);
    const existing = await run('first', { action: 'list_tabs' });
    expect(existing.scope).toBe('browser');
    const original = existing.tabs.find((tab: any) => tab.url === fixture.page.url());
    const observed = await run('first', { action: 'read', tab_id: original.tab_id });
    expect(observed.elements.find((element: any) => element.label === 'Draft title').value).toBe(
      'Existing application in progress',
    );
    browser.release('first');
    expect(browser.snapshot()[0].state).toBe('connected');
    await browser.request('second', 'Follow-up work', new AbortController().signal);
    expect(browser.snapshot().find((state) => state.activityId === 'second')?.id).toBe(pairing.id);
    const future = await fixture.context.newPage();
    await future.goto(`${fixture.origin}/future`);
    await expect
      .poll(async () => (await run('second', { action: 'list_tabs' })).tabs.length)
      .toBe(14);
    const inventory = await run('second', { action: 'list_tabs' });
    const tab = inventory.tabs.find((item: any) => item.url.endsWith('/future'));
    const firstTab = inventory.tabs.find((item: any) => item.url.endsWith('/existing-0'));
    await run('first', { action: 'read', tab_id: firstTab.tab_id });
    const read = await run('second', { action: 'read', tab_id: tab.tab_id });
    const field = read.elements.find((item: any) => item.label === 'Draft title');
    await run('second', {
      action: 'fill',
      tab_id: tab.tab_id,
      ref: field.ref,
      text: 'Reused browser access',
    });
    await expect(future.locator('#title')).toHaveValue('Reused browser access');
    // Reconnecting either chat reuses the grant and preserves its own target.
    expect(browser.reuse('first')).toBe(true);
    expect(browser.reuse('second')).toBe(true);
    const firstRead = await run('first', { action: 'read' });
    expect(firstRead.tab_id).toBe(firstTab.tab_id);
    const firstField = firstRead.elements.find((item: any) => item.label === 'Draft title');
    await run('first', { action: 'fill', ref: firstField.ref, text: 'First chat draft' });
    const secondRead = await run('second', { action: 'read' });
    expect(secondRead.tab_id).toBe(tab.tab_id);
    expect(secondRead.elements.find((item: any) => item.label === 'Draft title').value).toBe(
      'Reused browser access',
    );
    expect(
      browser.snapshot().every((state) => state.id === pairing.id && state.state === 'connected'),
    ).toBe(true);
    browser.stop('second');
    expect(browser.snapshot().every((state) => state.state === 'stopped')).toBe(true);
  } finally {
    browser.close();
    await fixture.close();
  }
});

test('browser pairing recovers from transport loss and a restarted extension worker', async () => {
  test.setTimeout(90_000);
  const fixture = await browserFixture();
  const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
  const run = (args: Record<string, unknown>) =>
    browser.execute(
      'chat',
      browser.prepare('chat', args),
      new AbortController().signal,
    ) as Promise<any>;
  try {
    const pairing = await browser.begin('chat', 'Resilient browser work');
    await fixture.attach(pairing.code, 'browser');
    await fixture.worker.evaluate(
      `globalThis.originalControlRequest = DextanaTransfer.request; DextanaTransfer.request = async () => {throw new TypeError('Injected transport interruption')};`,
    );
    await expect(fixture.popup.locator('#control-detail')).toContainText('Reconnecting');
    await fixture.worker.evaluate(`DextanaTransfer.request = globalThis.originalControlRequest;`);
    await expect(fixture.popup.locator('#control-detail')).toContainText(
      'Browser access is active',
    );
    expect(browser.snapshot()[0].id).toBe(pairing.id);
    const cdp = await fixture.context.newCDPSession(fixture.popup);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    await fixture.popup.reload();
    await expect(fixture.popup.locator('#control-stop')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => browser.snapshot()[0].reconnecting).toBe(false);
    const inventory = await run({ action: 'list_tabs' });
    const observed = await run({ action: 'read', tab_id: inventory.tabs[0].tab_id });
    expect(observed.elements.some((item: any) => item.label === 'Draft title')).toBe(true);
    expect(browser.snapshot()[0].id).toBe(pairing.id);
    await cdp.detach();
  } finally {
    browser.close();
    await fixture.close();
  }
});

test('browser pairing detects when the Dext desktop session has ended', async () => {
  test.setTimeout(45_000);
  const fixture = await browserFixture();
  const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
  try {
    const pairing = await browser.begin('chat', 'Browser work');
    await fixture.attach(pairing.code, 'browser');
    await expect(fixture.popup.locator('#control-detail')).toContainText(
      'Browser access is active',
    );

    browser.close();

    await expect(fixture.popup.locator('#status')).toContainText('Dext was closed or restarted', {
      timeout: 20_000,
    });
    await expect(fixture.popup.locator('#browser-control')).toBeHidden();
    const saved = await fixture.worker.evaluate(async () => ({
      pairing: (await (globalThis as any).chrome.storage.local.get('browserControlPairing'))
        .browserControlPairing,
      status: (await (globalThis as any).chrome.storage.session.get('browserControlStatus'))
        .browserControlStatus,
      badge: await (globalThis as any).chrome.action.getBadgeText({}),
    }));
    expect(saved.pairing).toBeUndefined();
    expect(saved.status).toMatchObject({ state: 'stopped' });
    expect(saved.badge).toBe('');
  } finally {
    browser.close();
    await fixture.close();
  }
});
