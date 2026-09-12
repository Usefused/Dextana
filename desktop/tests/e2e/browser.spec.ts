import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { test, start, reply, allowBrowser } from './fixture';

test('agent fills and submits a real page in an isolated sandbox browser', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><title>Work tracker</title><h1>Work tracker</h1><form><label>Task<input id="task" /></label><button type="submit">Add task</button></form><p id="result"></p><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();document.querySelector("#result").textContent="Added: "+document.querySelector("#task").value;localStorage.setItem("task",document.querySelector("#task").value)}</script>',
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const work = await workspace((body, res) => {
    const results = body.messages.filter((m: any) => m.role === 'tool');
    const steps = [
      { action: 'open', url, ref: '', text: '' },
      { action: 'fill', url: '', ref: '1', text: 'Review invoices' },
      { action: 'click', url: '', ref: '2', text: '' },
      { action: 'read', url: '', ref: '', text: '' },
    ];
    if (results.length < steps.length)
      reply(body, res, '', [{ function: { name: 'browser', arguments: steps[results.length] } }]);
    else reply(body, res, `Browser result: ${JSON.stringify(results.at(-1).content)}`);
    return true;
  });
  try {
    await start(work.page, 'Add Review invoices to the work tracker');
    await allowBrowser(work.page);
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/', {
      timeout: 60_000,
    });
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Added: Review invoices',
      { timeout: 60_000 },
    );
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/');
    const embedded = await work.app().evaluate(async ({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const view = windows[0].contentView.children.at(-1) as import('electron').WebContentsView;
      return {
        windows: windows.length,
        result: await view.webContents.executeJavaScript(
          'document.querySelector("#result").textContent',
        ),
        boundary: await view.webContents.executeJavaScript(
          '({ node: typeof window.require, bridge: typeof window.dextana })',
        ),
        cursor: await view.webContents.executeJavaScript(
          '!!document.querySelector("[data-dextana-cursor]")',
        ),
      };
    });
    expect(embedded).toEqual({
      windows: 1,
      result: 'Added: Review invoices',
      boundary: { node: 'undefined', bridge: 'undefined' },
      cursor: true,
    });
    const activityId = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).browser!.activityId,
    );
    await expect(work.page.getByRole('region', { name: 'Agent context' })).toContainText('Visited');
    // The native browser view must follow the CSS pane at both sides of the breakpoint.
    for (const width of [940, 1050, 1051, 1320]) {
      await work
        .app()
        .evaluate(
          ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size, 880),
          width,
        );
      await expect.poll(() => work.page.evaluate(() => window.innerWidth)).toBe(width);
      await work.page.getByRole('button', { name: 'Close browser pane' }).click();
      const sidebarWidth = (await work.page.locator('.sidebar').boundingBox())!.width;
      await work.page.evaluate((id) => window.dextana.showBrowser(id), activityId);
      await expect
        .poll(async () => (await work.page.locator('.sidebar').boundingBox())!.width)
        .toBe(sidebarWidth);
      const main = (await work.page.locator('main').boundingBox())!;
      expect(main.width).toBeGreaterThanOrEqual(380);
      const pane = (await work.page.locator('.browser-pane').boundingBox())!;
      await expect
        .poll(() =>
          work.app().evaluate(({ BrowserWindow }) => {
            const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
              -1,
            ) as import('electron').WebContentsView;
            const bounds = view.getBounds();
            return { x: bounds.x, width: bounds.width };
          }),
        )
        .toEqual({ x: pane.x, width: pane.width });
      expect(main.x + main.width).toBeLessThanOrEqual(pane.x);
      const input = (await work.page.getByLabel('Describe your work').boundingBox())!;
      expect(input.x + input.width).toBeLessThanOrEqual(pane.x);
      expect(await work.page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    await work.page.getByRole('button', { name: 'Close browser pane' }).click();
    await expect(work.page.getByLabel('Activity browser address')).not.toBeVisible();
    await start(work.page, 'Add a separate work item');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Added: Review invoices',
      { timeout: 30_000 },
    );
    await expect(work.page.getByRole('complementary', { name: 'In-app browser' })).toBeVisible();
    const partitions = await work.app().evaluate(({ webContents }, pageURL) => {
      const pages = webContents.getAllWebContents().filter((w) => w.getURL() === pageURL);
      return {
        count: pages.length,
        different: pages.length === 2 && pages[0].session !== pages[1].session,
      };
    }, url + '/');
    expect(partitions).toEqual({ count: 2, different: true });
    const screenshot = await work
      .app()
      .evaluate(async ({ BrowserWindow }) =>
        (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'),
      );
    await writeFile(testInfo.outputPath('browser-activity.png'), Buffer.from(screenshot, 'base64'));
  } finally {
    await work.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});

test('agent clears HttpOnly cookies only in its own activity browser', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Cookie test</title><h1>Session test</h1>');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages
      .slice(lastUser + 1)
      .filter((message: any) => message.role === 'tool');
    if (!results.length) {
      const action = body.messages[lastUser].content.includes('Clear cookies')
        ? 'clear_cookies'
        : 'open';
      reply(body, res, '', [
        {
          function: {
            name: 'browser',
            arguments: { action, url: action === 'open' ? url : '', ref: '', text: '' },
          },
        },
      ]);
    } else reply(body, res, `Browser receipt: ${results.at(-1).content}`);
    return true;
  });
  try {
    await start(work.page, 'Open first cookie session');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await start(work.page, 'Open second cookie session');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    await work.app().evaluate(async ({ webContents, session }, pageURL) => {
      const pages = webContents.getAllWebContents().filter((page) => page.getURL() === pageURL);
      if (pages.length !== 2) throw new Error('Expected two isolated activity browsers.');
      for (const page of pages) {
        await page.session.cookies.set({
          url: pageURL,
          name: 'login',
          value: 'test-session',
          httpOnly: true,
        });
        await page.executeJavaScript('localStorage.setItem("keep", "saved")');
      }
      await session.defaultSession.cookies.set({ url: pageURL, name: 'app-cookie', value: 'keep' });
    }, url);
    await work.page.getByLabel('Describe your work').fill('Clear cookies for this activity');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Cookies cleared',
      { timeout: 30_000 },
    );
    const state = await work
      .app()
      .evaluate(async ({ BrowserWindow, webContents, session }, pageURL) => {
        const active = BrowserWindow.getAllWindows()[0].contentView.children.at(
          -1,
        ) as import('electron').WebContentsView;
        const pages = webContents.getAllWebContents().filter((page) => page.getURL() === pageURL);
        return {
          activeCookies: (await active.webContents.session.cookies.get({})).length,
          otherCookies: (
            await pages.find((page) => page.id !== active.webContents.id)!.session.cookies.get({})
          ).map((cookie) => cookie.name),
          storage: await active.webContents.executeJavaScript('localStorage.getItem("keep")'),
          appCookies: (await session.defaultSession.cookies.get({ url: pageURL })).map(
            (cookie) => cookie.name,
          ),
        };
      }, url);
    expect(state).toEqual({
      activeCookies: 0,
      otherCookies: ['login'],
      storage: 'saved',
      appCookies: ['app-cookie'],
    });
    expect(JSON.stringify(work.calls[0].tools)).toContain('clear_cookies');
  } finally {
    await work.app().evaluate(async ({ session }, pageURL) => {
      await session.defaultSession.cookies.remove(pageURL, 'app-cookie');
    }, url);
    await work.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
