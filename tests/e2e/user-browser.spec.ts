import { expect } from '@playwright/test';
import { UserBrowser } from '../../src/main/user-browser';
import { browserFixture } from '../helpers/user-browser';
import { test, start, reply, allowBrowser } from './fixture';

function data(value: any, field = 'elements'): any {
  if (typeof value === 'string') {
    try {
      return data(JSON.parse(value), field);
    } catch {
      return;
    }
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value[field])) return value;
  for (const entry of Object.values(value)) {
    const found = data(entry, field);
    if (found) return found;
  }
}

test('real extension delivers trusted input, rejects stale refs, refreshes navigation and stops authority', async () => {
  test.setTimeout(90_000);
  const fixture = await browserFixture();
  const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
  const controller = new AbortController();
  const run = async (args: Record<string, unknown>) =>
    (await browser.execute('chat', browser.prepare('chat', args), controller.signal)) as any;
  try {
    const pairing = await browser.begin('chat', 'Fixture browser work');
    await fixture.attach(pairing.code);
    const read = await run({ action: 'read' });
    expect(JSON.stringify(read)).not.toContain('private-fixture-value');
    const title = read.elements.find(
      (element: any) => element.tag === 'input' && element.label === 'Draft title',
    );
    const save = read.elements.find((element: any) => element.tag === 'button');
    expect(title).toBeTruthy();
    expect(
      (await run({ action: 'fill', ref: title.ref, text: 'Updated in existing tab' })).error,
    ).toBeUndefined();
    await expect(run({ action: 'click', ref: save.ref })).rejects.toThrow(
      'current element reference',
    );
    const fresh = await run({ action: 'read' });
    expect(
      (
        await run({
          action: 'click',
          ref: fresh.elements.find((element: any) => element.tag === 'button').ref,
        })
      ).error,
    ).toBeUndefined();
    await expect(fixture.page.locator('#result')).toHaveText('Saved: Updated in existing tab');
    expect(await fixture.page.evaluate(() => (window as any).events)).toEqual([
      { kind: 'input', trusted: true },
      { kind: 'click', trusted: true },
    ]);
    const screenshot = await run({ action: 'screenshot' });
    expect(screenshot.image.data.length).toBeGreaterThan(100);
    await fixture.page.goto(fixture.origin + '/next');
    expect((await run({ action: 'read' })).url).toBe(fixture.origin + '/next');
    const unrelated = await fixture.context.newPage();
    await unrelated.goto(fixture.origin + '/unrelated');
    expect((await run({ action: 'read' })).url).toBe(fixture.origin + '/next');
    await fixture.popup.locator('#control-stop').click();
    await expect.poll(() => browser.snapshot()[0].state).toBe('stopped');
    expect(() => browser.prepare('chat', { action: 'read' })).toThrow('Attach');
    expect(fixture.errors).toEqual([]);
  } finally {
    browser.close();
    await fixture.close();
  }
});

test('Harnest uses the attached tab through approvals, shared UI and Context', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const fixture = await browserFixture();
  const source = await fixture.context.newPage();
  await source.goto(fixture.origin + '/source');
  await source.locator('#title').fill('Harnest draft');
  await source.evaluate(() => {
    document.title = 'Source draft';
  });
  let sourceTab = '';
  let destinationTab = '';
  let sourceValue = '';
  let step = 0;
  const results: any[] = [];
  const work = await workspace((body, res) => {
    const prompt =
      body.messages.filter((message: any) => message.role === 'user').at(-1)?.content || '';
    if (!prompt.includes('Update my attached draft')) {
      reply(body, res, 'Ready to connect a browser.');
      return true;
    }
    const tool = body.messages.filter((message: any) => message.role === 'tool').at(-1);
    if (tool) results.push(tool.content);
    const observed = data(tool?.content);
    if (step === 0) {
      step++;
      reply(body, res, '', [
        {
          function: { name: 'list_skills', arguments: { query: 'website interaction', limit: 50 } },
        },
      ]);
      return true;
    }
    if (step === 1) {
      const skill = data(tool?.content, 'skills')?.skills.find(
        (skill: any) => skill.id === 'browser-work',
      );
      expect(skill).toBeTruthy();
      step++;
      reply(body, res, '', [
        {
          function: {
            name: 'load_skill',
            arguments: { name: skill.id, source: skill.source, version: skill.version },
          },
        },
      ]);
      return true;
    }
    if (step === 2) expect(JSON.stringify(tool.content)).toContain('attached Chrome/Edge tab');
    if (step === 3) {
      const tabs = data(tool?.content, 'tabs').tabs;
      sourceTab = tabs.find((tab: any) => tab.url.endsWith('/source')).tab_id;
      destinationTab = tabs.find((tab: any) => !tab.url.endsWith('/source')).tab_id;
    }
    if (step === 4)
      sourceValue = observed.elements.find(
        (element: any) => element.tag === 'input' && element.label === 'Draft title',
      ).value;
    const sequence: any[] = [
      { action: 'list_tabs' },
      () => ({ action: 'read', tab_id: sourceTab }),
      () => ({ action: 'read', tab_id: destinationTab }),
      () => ({
        action: 'fill',
        tab_id: destinationTab,
        ref: observed?.elements.find(
          (element: any) => element.tag === 'input' && element.label === 'Draft title',
        )?.ref,
        text: sourceValue,
      }),
      () => ({ action: 'read', tab_id: destinationTab }),
      () => ({
        action: 'click',
        tab_id: destinationTab,
        ref: observed?.elements.find((element: any) => element.tag === 'button')?.ref,
      }),
      () => ({ action: 'read', tab_id: destinationTab }),
    ];
    const next = sequence[step++ - 2];
    if (next)
      reply(body, res, '', [
        { function: { name: 'browser', arguments: typeof next === 'function' ? next() : next } },
      ]);
    else {
      expect(observed?.text).toContain('Saved: Harnest draft');
      reply(body, res, 'Saved the draft as “Harnest draft” in your browser.');
    }
    return true;
  });
  try {
    await start(work.page, 'Prepare a browser task');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await work.page.getByRole('button', { name: 'Use my browser', exact: true }).click();
    await work.page.getByRole('button', { name: 'Create connection code' }).click();
    const code = await work.page.getByLabel('Browser control connection code').inputValue();
    await fixture.attach(code, [fixture.origin + '/', fixture.origin + '/source']);
    await expect(work.page.getByRole('dialog', { name: 'Use my browser' })).toContainText(
      'connected',
    );
    await work.page.screenshot({ path: '/private/tmp/dextana-user-browser-wide.png' });
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(940, 780));
    expect(
      await work.page
        .getByRole('dialog', { name: 'Use my browser' })
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await work.page.screenshot({ path: '/private/tmp/dextana-user-browser-narrow.png' });
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1320, 880));
    await work.page.getByRole('button', { name: 'Close Use my browser', exact: true }).click();
    await expect(work.page.locator('.context-panel')).toContainText('Browser action fixture');
    await expect(work.page.locator('.context-panel')).toContainText('Source draft');
    await work.page.getByLabel('Describe your work').fill('Update my attached draft and save it.');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByRole('region', { name: 'Action approval' })).toBeVisible();
    await expect(fixture.page.locator('#title')).toHaveValue('Original');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await expect(fixture.page.locator('#result')).toHaveText('Saved: Harnest draft');
    await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
      'Saved the draft as “Harnest draft” in your browser.',
    );
    expect(results.length).toBeGreaterThanOrEqual(6);
    expect(results.join(' ')).toContain('Tab 1');
    expect(results.join(' ')).toContain('Tab 2');
    await expect(source.locator('#title')).toHaveValue('Harnest draft');
    expect(results.join(' ')).not.toContain(code);
    await expect
      .poll(async () =>
        work.page.evaluate(async () => {
          const snapshot = await window.dextana.snapshot();
          const activity = snapshot.activities.find(
            (item) => item.title === 'Prepare a browser task',
          )!;
          return snapshot.userBrowsers?.find((item) => item.activityId === activity.id)?.state;
        }),
      )
      .toBe('connected');
    await fixture.popup.locator('#control-stop').click();
    await expect(work.page.locator('.context-panel')).toContainText('stopped');
    expect(
      await fixture.page.evaluate(() =>
        (window as any).events.every((event: any) => event.trusted),
      ),
    ).toBe(true);
  } finally {
    await fixture.close();
    await work.close();
  }
});

test('multiple selected tabs support concurrent input, cross-site navigation and created-tab lifecycle', async () => {
  test.setTimeout(90_000);
  const fixture = await browserFixture();
  const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
  const run = async (args: Record<string, unknown>) =>
    (await browser.execute(
      'multi',
      browser.prepare('multi', args),
      new AbortController().signal,
    )) as any;
  const second = await fixture.context.newPage();
  const secondURL = fixture.origin.replace('127.0.0.1', 'localhost') + '/second';
  await second.goto(secondURL);
  const unrelated = await fixture.context.newPage();
  await unrelated.goto(fixture.origin + '/unselected');
  try {
    const pairing = await browser.begin('multi', 'Compare drafts');
    await fixture.attach(pairing.code, [fixture.origin + '/', secondURL]);
    const inventory = await run({ action: 'list_tabs' });
    expect(inventory.tabs).toHaveLength(2);
    const a = inventory.tabs.find((tab: any) => tab.url === fixture.origin + '/').tab_id;
    const b = inventory.tabs.find((tab: any) => tab.url === secondURL).tab_id;
    const reads = await Promise.all([
      run({ action: 'read', tab_id: a }),
      run({ action: 'read', tab_id: b }),
    ]);
    const refs = reads.map(
      (result) =>
        result.elements.find(
          (element: any) => element.tag === 'input' && element.label === 'Draft title',
        ).ref,
    );
    await expect(
      run({ action: 'fill', tab_id: b, ref: refs[0], text: 'Wrong tab' }),
    ).rejects.toThrow('current element');
    await unrelated.bringToFront();
    const filled = await Promise.all([
      run({ action: 'fill', tab_id: a, ref: refs[0], text: 'Source draft' }),
      run({ action: 'fill', tab_id: b, ref: refs[1], text: 'Comparison draft' }),
    ]);
    expect(filled.map((result) => result.error)).toEqual([undefined, undefined]);
    await expect(fixture.page.locator('#title')).toHaveValue('Source draft');
    await expect(second.locator('#title')).toHaveValue('Comparison draft');
    await expect(unrelated.locator('#title')).toHaveValue('Original');
    const created = await run({ action: 'new_tab', url: fixture.origin + '/created' });
    expect(created.error).toBeUndefined();
    expect((await run({ action: 'list_tabs' })).tabs).toHaveLength(3);
    expect((await run({ action: 'read', tab_id: created.tab_id })).text).toContain('Review draft');
    const destination = secondURL + '/moved';
    expect(
      (await run({ action: 'open', tab_id: created.tab_id, url: destination })).error,
    ).toBeUndefined();
    await expect
      .poll(async () => (await run({ action: 'read', tab_id: created.tab_id })).url)
      .toBe(destination);
    expect((await run({ action: 'close_tab', tab_id: created.tab_id })).error).toBeUndefined();
    expect((await run({ action: 'list_tabs' })).tabs).toHaveLength(2);
    await second.close();
    await expect.poll(async () => (await run({ action: 'list_tabs' })).tabs.length).toBe(1);
    expect((await run({ action: 'read', tab_id: a })).text).toContain('Review draft');
    expect(await fixture.page.evaluate(() => (window as any).events)).toEqual([
      { kind: 'input', trusted: true },
    ]);
    await fixture.popup.locator('#control-stop').click();
    await expect.poll(() => browser.snapshot()[0].state).toBe('stopped');
    await expect(run({ action: 'read', tab_id: a })).rejects.toThrow('Attach');
  } finally {
    browser.close();
    await fixture.close();
  }
});

for (const initiation of ['manual', 'agent', 'wrong-tool'])
  test(`Harnest creates its first external task tab after ${initiation} connection and approval`, async ({
    workspace,
  }) => {
    test.setTimeout(90_000);
    const fixture = await browserFixture();
    await fixture.page.goto('about:blank');
    let step = 0;
    let tabId = '';
    const work = await workspace((body, res) => {
      const prompt =
        body.messages.filter((message: any) => message.role === 'user').at(-1)?.content || '';
      if (!prompt.includes('Create your own browser tab')) {
        reply(body, res, 'Ready.');
        return true;
      }
      const tool = body.messages.filter((message: any) => message.role === 'tool').at(-1);
      if (step === 0) {
        step++;
        reply(body, res, '', [
          {
            function: {
              name: 'list_skills',
              arguments: { query: 'website interaction', limit: 50 },
            },
          },
        ]);
        return true;
      }
      if (step === 1) {
        step++;
        const skill = data(tool?.content, 'skills').skills.find(
          (skill: any) => skill.id === 'browser-work',
        );
        reply(body, res, '', [
          {
            function: {
              name: 'load_skill',
              arguments: { name: skill.id, source: skill.source, version: skill.version },
            },
          },
        ]);
        return true;
      }
      if (step === (initiation !== 'manual' ? 5 : 4))
        tabId = data(tool?.content, 'tabs').tabs[0].tab_id;
      const observed = data(tool?.content);
      const actions = [
        ...(initiation !== 'manual'
          ? [() => ({ action: initiation === 'wrong-tool' ? 'list_tabs' : 'connect_user' })]
          : []),
        () => ({ action: 'new_tab', url: fixture.origin + '/autonomous' }),
        () => ({ action: 'list_tabs' }),
        () => ({ action: 'read', tab_id: tabId }),
        () => ({
          action: 'fill',
          tab_id: tabId,
          ref: observed.elements.find(
            (item: any) => item.tag === 'input' && item.label === 'Draft title',
          ).ref,
          text: 'Autonomous draft',
        }),
        () => ({ action: 'read', tab_id: tabId }),
      ];
      const next = actions[step++ - 2];
      if (next) reply(body, res, '', [{ function: { name: 'browser', arguments: next() } }]);
      else {
        expect(observed.elements.find((item: any) => item.label === 'Draft title').value).toBe(
          'Autonomous draft',
        );
        reply(body, res, 'Prepared the draft in a new browser tab.');
      }
      return true;
    });
    try {
      await start(work.page, 'Prepare autonomous browser work');
      await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
      if (initiation === 'manual') {
        await work.page.getByRole('button', { name: 'Use my browser', exact: true }).click();
        await work.page.getByRole('button', { name: 'Create connection code' }).click();
        await fixture.attach(
          await work.page.getByLabel('Browser control connection code').inputValue(),
          [],
        );
        await expect(work.page.getByRole('dialog', { name: 'Use my browser' })).toContainText(
          'Ready to open task tabs',
        );
        await work.page.getByRole('button', { name: 'Close Use my browser', exact: true }).click();
        await expect(work.page.locator('.context-panel')).toContainText('Browser task tabs');
      }
      const pagesBefore = fixture.context.pages().length;
      await work.page
        .getByLabel('Describe your work')
        .fill('Create your own browser tab in my external Chrome browser and prepare the draft.');
      await work.page.getByRole('button', { name: 'Send message' }).click();
      await expect(work.page.getByRole('region', { name: 'Action approval' })).toBeVisible();
      expect(fixture.context.pages()).toHaveLength(pagesBefore);
      await allowBrowser(work.page);
      if (initiation !== 'manual') {
        const dialog = work.page.getByRole('dialog', { name: 'Use my browser' });
        await expect(dialog).toBeVisible();
        const codeInput = work.page.getByLabel('Browser control connection code');
        await expect(codeInput).not.toHaveValue('');
        expect(fixture.context.pages()).toHaveLength(pagesBefore);
        await fixture.attach(await codeInput.inputValue(), []);
        await expect(dialog).not.toBeVisible();
      }
      await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
        timeout: 60_000,
      });
      const created = fixture.context
        .pages()
        .find((page) => page.url() === fixture.origin + '/autonomous');
      expect(created).toBeTruthy();
      await expect(created!.locator('#title')).toHaveValue('Autonomous draft');
      await expect(work.page.locator('.context-panel')).toContainText('Browser action fixture');
      await expect(work.page.locator('.context-panel')).not.toContainText('Browser task tabs');
      await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
        'Prepared the draft in a new browser tab.',
      );
      expect(fixture.page.url()).toBe('about:blank');
    } finally {
      await fixture.close();
      await work.close();
    }
  });
