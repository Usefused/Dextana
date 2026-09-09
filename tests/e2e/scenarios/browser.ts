import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { start, reply, allowBrowser } from '../fixture';

import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* browserSessions(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
  const visits: string[] = [];
  let unavailable = false;
  const site = createServer((req, res) => {
    visits.push(`${req.method} ${req.url}`);
    if (unavailable) {
      req.socket.destroy();
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><title>Saved work</title><h1>Saved work page</h1><a href="/latest">Continue</a>',
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'browser',
            arguments: {
              action: body.messages[lastUser].content.includes('Read') ? 'read' : 'open',
              url: url + '/start',
              ref: '',
              text: '',
            },
          },
        },
      ]);
    else reply(body, res, 'Saved page ready.');
    return true;
  });
  try {
    await start(work.page, 'Open my saved workspace');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await work.app().evaluate(async ({ BrowserWindow }, origin) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
        -1,
      ) as import('electron').WebContentsView;
      await view.webContents.session.cookies.set({
        url: origin,
        name: 'saved-login',
        value: 'workspace-one',
        httpOnly: true,
        expirationDate: Date.now() / 1000 + 3600,
      });
      await view.webContents.session.cookies.flushStore();
      await view.webContents.executeJavaScript(
        'localStorage.setItem("workspace", "one"); document.querySelector("a").click()',
      );
    }, url);
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/latest');
    await expect
      .poll(() =>
        work.page.evaluate(
          async () => (await window.dextana.snapshot()).activities[0].browser?.url,
        ),
      )
      .toBe(url + '/latest');
    yield;
    const beforeReopen = visits.length;
    await work.page.getByRole('button', { name: 'Open my saved workspace', exact: true }).click();
    await expect(
      work.page.getByRole('button', { name: 'Reopen browser', exact: true }),
    ).toBeVisible();
    await expect(work.page.getByLabel('Activity browser address')).toHaveCount(0);
    expect(visits.length).toBe(beforeReopen);
    unavailable = true;
    await work.page.getByRole('button', { name: 'Reopen browser', exact: true }).click();
    await expect(work.page.getByRole('alert')).toContainText('Could not reopen this page');
    await expect(
      work.page.getByRole('button', { name: 'Reopen browser', exact: true }),
    ).toBeEnabled();
    await expect(work.page.getByLabel('Activity browser address')).toHaveCount(0);
    unavailable = false;
    await work.page.getByRole('button', { name: 'Reopen browser', exact: true }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url + '/latest');
    await expect(work.page.getByRole('alert')).toHaveCount(0);
    const restored = await work.app().evaluate(async ({ BrowserWindow }, origin) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
        -1,
      ) as import('electron').WebContentsView;
      return {
        cookie: (
          await view.webContents.session.cookies.get({ url: origin, name: 'saved-login' })
        )[0]?.value,
        storage: await view.webContents.executeJavaScript('localStorage.getItem("workspace")'),
        cursor: await view.webContents.executeJavaScript(
          '!!document.querySelector("[data-dextana-cursor]")',
        ),
      };
    }, url);
    expect(restored).toEqual({ cookie: 'workspace-one', storage: 'one', cursor: true });
    expect(visits.slice(beforeReopen)).not.toContain('GET /start');
    expect(visits.some((value) => value.startsWith('POST'))).toBe(false);
    await work.page.getByLabel('Describe your work').fill('Read the restored page');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Saved page ready',
    );
    await start(work.page, 'Open a different workspace');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    const other = await work.app().evaluate(async ({ BrowserWindow }, origin) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
        -1,
      ) as import('electron').WebContentsView;
      return {
        cookie: (await view.webContents.session.cookies.get({ url: origin, name: 'saved-login' }))
          .length,
        storage: await view.webContents.executeJavaScript('localStorage.getItem("workspace")'),
      };
    }, url);
    expect(other).toEqual({ cookie: 0, storage: null });
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
}
