import { createServer } from 'node:http';
import { expect } from '@playwright/test';
import { test, start, reply, allowBrowser } from './fixture';

test('login suggestions detect dynamic forms, web components, and visible embedded forms', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const cases: Record<string, string> = {
    fields: '<form><label>Username<input name="username"></label><button>Sign in</button></form>',
    shadow:
      '<login-box></login-box><script>document.querySelector("login-box").attachShadow({mode:"open"}).innerHTML=\'<label>Password<input type="password"></label>\'</script>',
    dynamic:
      '<div id="content"></div><script>setTimeout(()=>document.querySelector("#content").innerHTML=\'<div role="dialog"><p>Sign in to your workspace</p><button>Continue with Google</button></div>\', 1800)</script>',
    embedded: '',
    hidden: '',
    ordinary:
      '<nav><a href="/login">Sign in</a></nav><h1>Welcome to our store</h1><form><label>Newsletter email<input type="email"></label><button>Subscribe</button></form><div style="visibility:hidden"><input type="password"></div><div style="opacity:0"><input type="password"></div><input type="password" autocomplete="new-password" style="display:none">',
  };
  const site = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<title>Example workspace</title>' +
        (cases[req.url!.slice(1)] ?? '<label>Password<input type="password"></label>'),
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  const remote = origin.replace('127.0.0.1', 'localhost');
  cases.embedded = `<iframe src="${remote}/password" style="width:300px;height:180px"></iframe>`;
  cases.hidden = `<iframe src="${remote}/password" style="display:none"></iframe><h1>Dashboard</h1>`;
  const work = await workspace((body, res) => {
    if (!body.messages.some((m: any) => m.role === 'tool')) {
      const name = body.messages
        .filter((m: any) => m.role === 'user')
        .at(-1)
        .content.split(' ')
        .at(-1);
      reply(body, res, '', [
        { function: { name: 'browser', arguments: { action: 'open', url: origin + '/' + name } } },
      ]);
    } else reply(body, res, 'Website ready.');
    return true;
  });
  const offers = () =>
    work
      .app()
      .windows()
      .filter((page) => page.url().startsWith('data:text/html'));
  const hasOffer = () => offers().length > 0;
  try {
    for (const name of ['fields', 'shadow', 'dynamic', 'embedded'])
      await test.step(name, async () => {
        await start(work.page, 'Detect login ' + name);
        await allowBrowser(work.page);
        await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
        await expect.poll(hasOffer, { timeout: 10_000 }).toBe(true);
        await offers()[0].getByRole('button', { name: 'Use login from my browser' }).click();
        await expect(
          work.page.getByRole('dialog', { name: 'Use login from my browser' }),
        ).toBeVisible();
        await work.page.getByRole('button', { name: 'Cancel transfer', exact: true }).click();
        await work.page.getByRole('button', { name: 'New activity' }).click();
      });
    for (const name of ['ordinary', 'hidden'])
      await test.step('ignore ' + name, async () => {
        await start(work.page, 'Detect login ' + name);
        await allowBrowser(work.page);
        await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
        // Observe multiple native detector ticks, rather than passing before its first check.
        for (let tick = 0; tick < 3; tick++) {
          await work.page.waitForTimeout(1250);
          expect(hasOffer()).toBe(false);
        }
        await work.page.getByRole('button', { name: 'New activity' }).click();
      });
    await test.step('dismissed suggestions return for a new login attempt at the same URL', async () => {
      await start(work.page, 'Detect login fields');
      await allowBrowser(work.page);
      await expect.poll(hasOffer).toBe(true);
      await offers()[0].getByRole('button', { name: 'Dismiss login suggestion' }).click();
      await work.page.waitForTimeout(1500);
      expect(hasOffer()).toBe(false);
      await work.app().evaluate(async ({ BrowserWindow }) => {
        const host = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!;
        const view = host.contentView.children.at(-1) as import('electron').WebContentsView;
        await view.webContents.executeJavaScript(
          'document.body.innerHTML = "<h1>Your workspace</h1>"',
        );
      });
      await work.page.waitForTimeout(1500);
      await work.app().evaluate(async ({ BrowserWindow }) => {
        const host = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!;
        const view = host.contentView.children.at(-1) as import('electron').WebContentsView;
        await view.webContents.executeJavaScript(
          'document.body.innerHTML = "<label>Password<input type=password></label>"',
        );
      });
      await expect.poll(hasOffer).toBe(true);
      await offers()[0].getByRole('button', { name: 'Dismiss login suggestion' }).click();
    });
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
