import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

test('agents target owned tabs while the owner switches pages, and tabs survive restart', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const site = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><title>${req.url === '/one' ? 'First page' : 'Second page'}</title><input aria-label="Task"><p>${req.url}</p>`,
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  let firstTab = '';
  const work = await workspace((body, res) => {
    const last = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[last].content
      .split('Current owner request:\n')
      .at(-1)
      .split('\n')[0];
    const results = body.messages.slice(last + 1).filter((m: any) => m.role === 'tool');
    let action;
    if (prompt === 'Prepare two browser tabs') {
      action = [
        { action: 'open', url: url + '/one' },
        { action: 'new_tab', url: url + '/two' },
      ][results.length];
    } else if (prompt === 'Fill the first tab') {
      action = [
        { action: 'read', tab_id: firstTab },
        { action: 'fill', tab_id: firstTab, ref: '1', text: 'First tab only' },
      ][results.length];
    } else if (
      prompt === 'Read the default tab' ||
      prompt === 'List browser tabs' ||
      prompt === 'Close the remaining tab'
    ) {
      action = results.length
        ? undefined
        : {
            action:
              prompt === 'List browser tabs'
                ? 'list_tabs'
                : prompt === 'Close the remaining tab'
                  ? 'close_tab'
                  : 'read',
          };
    } else if (prompt === 'Try another chat tab') {
      action = results.length ? undefined : { action: 'read', tab_id: firstTab };
    }
    if (action) reply(body, res, '', [{ function: { name: 'browser', arguments: action } }]);
    else if (results.at(-1)?.content.includes('This tab does not belong'))
      reply(body, res, 'This tab does not belong to this activity.');
    else reply(body, res, 'Tabs ready.');
    return true;
  });
  try {
    await start(work.page, 'Prepare two browser tabs');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const tabs = work.page.getByRole('tablist', { name: 'Browser tabs' });
    await expect(tabs.getByRole('tab', { name: /First page/ })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /Second page/ })).toBeVisible();
    const stripBounds = (await tabs.boundingBox())!;
    const selectedBounds = (await tabs.getByRole('tab', { selected: true }).locator('..').boundingBox())!;
    expect(selectedBounds.x).toBeGreaterThanOrEqual(stripBounds.x - 1);
    expect(selectedBounds.x + selectedBounds.width).toBeLessThanOrEqual(
      stripBounds.x + stripBounds.width + 1,
    );
    await work.page.screenshot({ path: '/private/tmp/dextana-tabs-strip.png' });
    firstTab = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).activities[0].browser!.tabs![0].id,
    );
    await tabs.getByRole('tab', { name: /Second page/ }).click();
    await work.page.getByLabel('Describe your work').fill('Fill the first tab');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message')).toHaveCount(2);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Tabs ready.');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/two');
    const inputValue = () =>
      work.app().evaluate(async ({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
          -1,
        ) as import('electron').WebContentsView;
        return view.webContents.executeJavaScript('document.querySelector("input").value');
      });
    expect(await inputValue()).toBe('');
    await tabs.getByRole('tab', { name: /First page/ }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/one');
    await expect.poll(inputValue).toBe('First tab only');
    const savedActivityId = await work.page.evaluate(async () => (await window.dextana.snapshot()).activities.find(activity => activity.title === 'Prepare two browser tabs')!.id);
    await work.page.reload();
    await expect(work.page.getByRole('complementary', { name: 'In-app browser' })).toHaveCount(0);
    await expect(work.page.getByLabel('Activity browser address')).toHaveCount(0);
    expect(await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length)).toBe(0);
    // A late request from the prior screen must not reattach a native view over Welcome.
    await work.page.evaluate(id => window.dextana.showBrowser(id), savedActivityId);
    expect(await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.length)).toBe(0);
    await work.restart();
    await expect(work.page.getByLabel('Activity browser address')).toHaveCount(0);
    await work.page.getByRole('button', { name: 'Prepare two browser tabs', exact: true }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveCount(0);
    await work.page.getByRole('button', { name: 'Reopen browser', exact: true }).click();
    await expect(work.page.getByRole('tab', { name: /First page/ })).toBeVisible();
    await work.page.getByRole('tab', { name: /Second page/ }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/two');
    await work.page.getByRole('button', { name: 'Close tab Second page' }).click();
    await expect(work.page.getByRole('tab', { name: /Second page/ })).toHaveCount(0);
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/one');
    await work.page.getByRole('button', { name: 'New browser tab' }).click();
    const form = (await work.page.locator('.browser-new-tab').boundingBox())!;
    const surface = (await work.page.locator('.browser-surface').boundingBox())!;
    expect(form.y + form.height).toBeLessThanOrEqual(surface.y);
    await work.page.screenshot({ path: '/private/tmp/dextana-tabs-ui.png' });
    await work.page.getByLabel('New tab address').fill(url + '/two');
    await work.page.getByRole('button', { name: 'Open new tab', exact: true }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/two');
    await start(work.page, 'Try another chat tab');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'This tab does not belong to this activity',
    );
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await work.page.getByRole('button', { name: 'Prepare two browser tabs', exact: true }).click();
    await work.page.getByRole('button', { name: 'Ask before browser actions' }).click();
    await work.page.getByLabel('Describe your work').fill('Read the default tab');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByRole('region', { name: 'Action approval' })).toBeVisible();
    await work.page.getByRole('button', { name: 'Close tab First page' }).click();
    await expect(work.page.getByRole('tab', { name: /First page/ })).toHaveCount(0);
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'This tab does not belong to this activity',
    );
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    for (const prompt of ['List browser tabs', 'Close the remaining tab']) {
      await work.page.getByLabel('Describe your work').fill(prompt);
      await work.page.getByRole('button', { name: 'Send message' }).click();
      await expect(work.page.locator('.message.user').last()).toHaveText(new RegExp(prompt));
      await expect(work.page.getByTestId('assistant-message').last()).toContainText('Tabs ready.');
    }
    await expect(work.page.getByRole('button', { name: 'Show browser', exact: true })).toHaveCount(
      0,
    );
    await work.restart();
    await work.page.getByRole('button', { name: 'Prepare two browser tabs', exact: true }).click();
    await expect(work.page.getByRole('button', { name: /^(Reopen|Show) browser$/ })).toHaveCount(0);
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});

test('delegated agents work concurrently in separate browser tabs without stealing the viewed page', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const pending = new Map<string, () => void>();
  const site = createServer((req, res) => {
    pending.set(req.url!, () => {
      if (res.writableEnded || res.destroyed) return;
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><title>Worker ${req.url}</title><h1>${req.url}</h1>`);
    });
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const work = await workspace((body, res) => {
    const prompt = body.messages.filter((m: any) => m.role === 'user').at(-1).content;
    if (body.messages.some((m: any) => m.role === 'tool'))
      reply(body, res, 'Worker work complete.');
    else if (prompt === 'Research with two browser workers')
      reply(body, res, '', [
        {
          function: {
            name: 'delegate',
            arguments: {
              tasks: [
                { prompt: 'Visit worker Alpha', model: 'qwen3:8b' },
                { prompt: 'Visit worker Beta', model: 'llama3.2:3b' },
              ],
            },
          },
        },
      ]);
    else
      reply(body, res, '', [
        {
          function: {
            name: 'browser',
            arguments: {
              action: 'open',
              url: url + (prompt.includes('Alpha') ? '/alpha' : '/beta'),
            },
          },
        },
      ]);
    return true;
  });
  try {
    await start(work.page, 'Research with two browser workers');
    for (const worker of ['Alpha', 'Beta']) {
      await work.page.getByRole('button', { name: `Visit worker ${worker}`, exact: true }).click();
      await allowBrowser(work.page);
    }
    await expect.poll(() => pending.size).toBe(2); // Both requests remain in flight together.
    await work.page
      .getByRole('button', { name: 'Research with two browser workers', exact: true })
      .click();
    pending.get('/alpha')!();
    await expect(work.page.getByRole('tab', { name: /Worker \/alpha/ })).toBeVisible();
    await work.page.getByRole('tab', { name: /Worker \/alpha/ }).click();
    pending.get('/beta')!();
    await expect(work.page.getByRole('tab', { name: /Worker \/beta/ })).toBeVisible();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/alpha');
    await work.page.getByRole('tab', { name: /Worker \/beta/ }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/beta');
    await expect(
      work.page.getByRole('heading', { name: 'Research with two browser workers', exact: true }),
    ).toBeVisible();
  } finally {
    for (const finish of pending.values()) finish();
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
