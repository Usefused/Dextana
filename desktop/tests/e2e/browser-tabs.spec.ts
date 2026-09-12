import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

test('tab selection swaps the native page without closing the pane or stacking old views', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const site = createServer((req, res) => {
    const blue = req.url === '/blue';
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<title>${blue ? 'Blue' : 'Red'} page</title><body style="margin:0;background:${blue ? '#0000ff' : '#ff0000'};height:100vh"><h1>${blue ? 'Blue' : 'Red'} page</h1></body>`,
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const work = await workspace((body, res) => {
    if (body.messages.some((m: any) => m.role === 'tool')) reply(body, res, 'Page ready.');
    else
      reply(body, res, '', [
        { function: { name: 'browser', arguments: { action: 'open', url: base + '/red' } } },
      ]);
    return true;
  });
  async function visiblePage(path: string, color: 'red' | 'blue') {
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(base + path);
    await expect
      .poll(() =>
        work.app().evaluate(async ({ BrowserWindow }, base) => {
          const host = BrowserWindow.getAllWindows()[0];
          const views = host.contentView.children.filter((view: any) =>
            view.webContents?.getURL().startsWith(base),
          ) as import('electron').WebContentsView[];
          if (views.length !== 1) return { count: views.length };
          const view = views[0],
            bounds = view.getBounds();
          const pixel = (
            await view.webContents.capturePage({
              x: Math.floor(bounds.width / 2),
              y: Math.floor(bounds.height / 2),
              width: 1,
              height: 1,
            })
          ).toBitmap();
          // Native captures are color-managed on macOS; check the dominant channel.
          const color =
            pixel[2] > pixel[0] + 100 && pixel[2] > pixel[1] + 100
              ? 'red'
              : pixel[0] > pixel[2] + 100 && pixel[0] > pixel[1] + 100
                ? 'blue'
                : 'other';
          return {
            url: view.webContents.getURL(),
            visible: view.getVisible(),
            topmost: host.contentView.children.at(-1) === view,
            color,
          };
        }, base),
      )
      .toEqual({ url: base + path, visible: true, topmost: true, color });
  }
  try {
    await start(work.page, 'Switch between colored browser pages');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await visiblePage('/red', 'red');
    await work.page.getByRole('button', { name: 'New browser tab', exact: true }).click();
    await work.page.getByLabel('New tab address', { exact: true }).fill(base + '/blue');
    await work.page.getByRole('button', { name: 'Open new tab', exact: true }).click();
    await visiblePage('/blue', 'blue');
    await work.page.evaluate(() => {
      (window as any).__tabViews = [];
      (window as any).__stopTabViews = window.dextana.subscribe((state) =>
        (window as any).__tabViews.push(state.browser?.url ?? null),
      );
    });
    for (const path of ['/red', '/blue', '/red']) {
      await work.page
        .getByRole('tab', { name: new RegExp(path === '/red' ? 'Red page' : 'Blue page') })
        .click();
      await visiblePage(path, path === '/red' ? 'red' : 'blue');
    }
    await work.page.getByRole('button', { name: 'Close tab Red page', exact: true }).click();
    await visiblePage('/blue', 'blue');
    const events = await work.page.evaluate(() => {
      (window as any).__stopTabViews();
      return (window as any).__tabViews;
    });
    expect(events).not.toContain(null);
    // A stopped external connection must not block the owner's saved in-app tabs.
    const activityId = await work.page.evaluate(async () => {
      const state = await window.dextana.snapshot();
      const id = state.browser!.activityId;
      await window.dextana.beginUserBrowser(id);
      await window.dextana.stopUserBrowser(id);
      await window.dextana.hideBrowser();
      return id;
    });
    await work.page.evaluate((id) => window.dextana.showBrowser(id), activityId);
    await visiblePage('/blue', 'blue');
    const connection = await work.page.evaluate(
      async (id) =>
        (await window.dextana.snapshot()).userBrowsers?.find((state) => state.activityId === id),
      activityId,
    );
    expect(connection?.state).toBe('stopped');
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
    const prompt = body.messages
      .filter((m: any) => m.role === 'user')
      .at(-1)
      .content.split('Current owner request:\n')
      .at(-1)
      .split('\n')[0];
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
