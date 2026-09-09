import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

// The external Chrome extension is substituted at its HTTP boundary. The
// destination is the real Electron browser, reached through the real approval UI.
test('website login transfer needs approval, imports before scripts, and consumes its connection', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<title>Welcome back</title><label>Email<input type="email" autocomplete="username"></label><button>Continue</button><script>document.title = localStorage.getItem("login") === "local-test" && sessionStorage.getItem("login") === "session-test" ? "Signed in" : "Sign in"</script>',
    );
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    if (!body.messages.some((m: any) => m.role === 'tool'))
      reply(body, res, '', [{ function: { name: 'browser', arguments: { action: 'open', url } } }]);
    else reply(body, res, 'Please sign in to the website.');
    return true;
  });
  try {
    await start(work.page, 'Open website login transfer test');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await expect
      .poll(() =>
        work
          .app()
          .windows()
          .some((page) => page.url().startsWith('data:text/html')),
      )
      .toBe(true);
    const offer = work
      .app()
      .windows()
      .find((page) => page.url().startsWith('data:text/html'))!;
    await expect(offer.getByText('Already signed in elsewhere?')).toBeVisible();
    const position = await work.app().evaluate(({ BrowserWindow }) => {
      const host = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!;
      const popup = BrowserWindow.getAllWindows().find((w) => w.getParentWindow() === host)!;
      const view = host.contentView.children.at(-1) as import('electron').WebContentsView;
      return {
        popup: popup.getBounds(),
        host: host.getContentBounds(),
        browser: view.getBounds(),
        pageVisible: view.getVisible(),
      };
    });
    expect(position.popup.y).toBeGreaterThan(position.host.y + position.browser.y);
    expect(position.popup.width).toBeLessThanOrEqual(320);
    expect(position.pageVisible).toBe(true);
    await offer.screenshot({ path: testInfo.outputPath('website-login-popup.png') });
    await offer.getByRole('button', { name: 'Use login from my browser' }).click();

    const code = await work.page.getByLabel('Browser connection code').inputValue();
    const previousClipboard = await work.app().evaluate(({ clipboard }) => clipboard.readText());
    try {
      await work.page.getByRole('button', { name: 'Copy connection code', exact: true }).click();
      await expect(work.page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      expect(await work.app().evaluate(({ clipboard }) => clipboard.readText())).toBe(code);
    } finally {
      await work.app().evaluate(({ clipboard }, previous) => {
        clipboard.writeText(previous);
      }, previousClipboard);
    }
    const [port, token] = code.split('.');
    const endpoint = `http://127.0.0.1:${port}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Origin: `chrome-extension://${'a'.repeat(32)}`,
      'Content-Type': 'application/json',
    };
    expect((await fetch(endpoint + '/request')).status).toBe(403);
    expect((await fetch(endpoint + '/request', { headers })).status).toBe(200);
    const payload = {
      origin: new URL(url).origin,
      approved: true,
      selected: ['cookies', 'localStorage', 'sessionStorage'],
      cookies: [
        {
          name: 'login',
          value: 'cookie-test',
          domain: '127.0.0.1',
          path: '/',
          httpOnly: true,
          secure: false,
          hostOnly: true,
          sameSite: 'lax',
        },
      ],
      localStorage: [{ name: 'login', value: 'local-test' }],
      sessionStorage: [{ name: 'login', value: 'session-test' }],
    };
    expect(
      (
        await fetch(endpoint + '/import', {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...payload, approved: false }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(endpoint + '/import', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
      ).status,
    ).toBe(200);
    await expect(work.page.getByText('Login state transferred.')).toBeVisible();
    // Leave the completion notice open: another transfer must start with fresh UI state.
    const transferredState = () => work.app().evaluate(async ({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
        -1,
      ) as import('electron').WebContentsView;
      if (!view) return undefined;
      return {
        title: view.webContents.getTitle(),
        cookies: (await view.webContents.session.cookies.get({ name: 'login' })).map((c) => ({
          value: c.value,
          httpOnly: c.httpOnly,
          session: c.session,
        })),
      };
    });
    await expect.poll(transferredState).toEqual({
      title: 'Signed in',
      cookies: [{ value: 'cookie-test', httpOnly: true, session: true }],
    });
    expect(JSON.stringify(work.calls)).not.toContain('cookie-test');
    await work.page.getByRole('button', { name: 'Use login from my browser' }).click();
    const staleCode = await work.page.getByLabel('Browser connection code').inputValue();
    const [stalePort, staleToken] = staleCode.split('.');
    await work.app().evaluate(async ({ BrowserWindow }, pageURL) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
        -1,
      ) as import('electron').WebContentsView;
      await view.webContents.loadURL(pageURL + '?changed');
    }, url);
    expect(
      (
        await fetch(`http://127.0.0.1:${stalePort}/import`, {
          method: 'POST',
          headers: { ...headers, Authorization: `Bearer ${staleToken}` },
          body: JSON.stringify({
            ...payload,
            cookies: [{ ...payload.cookies[0], value: 'must-not-import' }],
          }),
        })
      ).status,
    ).toBe(409);
    await expect(work.page.getByRole('alert')).toContainText('Transfer could not finish');
    await work.page.getByRole('button', { name: 'Done', exact: true }).click();
    expect(
      await work.app().evaluate(async ({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
          -1,
        ) as import('electron').WebContentsView;
        return (await view.webContents.session.cookies.get({ name: 'login' }))[0]?.value;
      }),
    ).toBe('cookie-test');
    await work.page.getByRole('button', { name: 'Use login from my browser' }).click();
    const cancelled = await work.page.getByLabel('Browser connection code').inputValue();
    await work.page.getByRole('button', { name: 'Cancel transfer', exact: true }).click();
    const [cancelPort, cancelToken] = cancelled.split('.');
    await expect(
      fetch(`http://127.0.0.1:${cancelPort}/import`, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${cancelToken}` },
        body: JSON.stringify(payload),
      }),
    ).rejects.toThrow();
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});

for (const openSourceSite of [false, true]) {
  test(`the real Chromium extension approves and transfers a signed-in source tab${openSourceSite ? ' across a login redirect' : ''}`, async ({
    workspace,
  }, testInfo) => {
    test.setTimeout(120_000);
    const { chromium } = await import('@playwright/test');
    const { mkdtemp, cp, readFile, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join, resolve } = await import('node:path');
    const { createHash } = await import('node:crypto');
    const extension = await mkdtemp(join(tmpdir(), 'dextana-extension-'));
    await cp(resolve('browser-extension'), extension, { recursive: true });
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
    // Browser-level permission has already been granted in this fixture. Capture,
    // selection, approval, Chrome APIs and transport all run from production files.
    manifest.permissions.push('cookies');
    manifest.host_permissions.push('http://localhost/*');
    manifest.optional_permissions = [];
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    const extensionId = createHash('sha256')
      .update(Buffer.from(manifest.key, 'base64'))
      .digest('hex')
      .slice(0, 32)
      .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
    let sourceVisits = 0;
    const site = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      if (req.url === '/source') {
        if (sourceVisits++ === 0)
          res.setHeader(
            'Set-Cookie',
            'extension-login=synthetic-http-only; HttpOnly; SameSite=Lax; Path=/',
          );
        res.end(
          '<title>Signed-in source</title><script>document.title=localStorage.getItem("login") === "from-chrome" && sessionStorage.getItem("tab") === "from-source-tab" ? "Transferred from Chrome" : "Signed-in source";localStorage.setItem("login", "from-chrome");sessionStorage.setItem("tab", "from-source-tab")</script>',
        );
      } else
        setTimeout(
          () =>
            res.end(
              '<title>Sign in</title><input type="password"><script>document.title=localStorage.getItem("login") === "from-chrome" && sessionStorage.getItem("tab") === "from-source-tab" ? "Transferred from Chrome" : "Sign in"</script>',
            ),
          req.headers.cookie?.includes('extension-login=') ? 1200 : 0,
        );
    });
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
    const sourceOrigin = openSourceSite ? origin.replace('127.0.0.1', 'localhost') : origin;
    const chrome = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    const work = await workspace((body, res) => {
      if (!body.messages.some((m: any) => m.role === 'tool'))
        reply(body, res, '', [
          { function: { name: 'browser', arguments: { action: 'open', url: origin + '/login' } } },
        ]);
      else reply(body, res, 'Sign in to continue.');
      return true;
    });
    try {
      let source = await chrome.newPage();
      await source.goto(sourceOrigin + '/source');
      await start(work.page, 'Open real extension transfer test');
      await allowBrowser(work.page);
      await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
        timeout: 60_000,
      });
      await work.page.getByRole('button', { name: 'Use login from my browser' }).click();
      await work.app().evaluate(({ shell, clipboard }) => {
        const state = globalThis as any;
        state.restoreExtensionUI = { openPath: shell.openPath, writeText: clipboard.writeText };
        shell.openPath = async (path) => {
          state.openedExtensionPath = path;
          return '';
        };
        clipboard.writeText = (text) => {
          state.copiedLoginCode = text;
        };
      });
      const code = await work.page.getByLabel('Browser connection code').inputValue();
      await work.page.getByRole('button', { name: 'Copy connection code', exact: true }).click();
      await expect(work.page.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      expect(await work.app().evaluate(() => (globalThis as any).copiedLoginCode)).toBe(code);
      await work.page.locator('summary').filter({ hasText: 'Need the extension?' }).click();
      await work.page.getByRole('button', { name: 'Open extension folder', exact: true }).click();
      const installedFolder = join(work.directory, 'Browser Extensions', 'Dextana Login');
      await expect
        .poll(() => work.app().evaluate(() => (globalThis as any).openedExtensionPath))
        .toBe(installedFolder);
      expect(JSON.parse(await readFile(join(installedFolder, 'manifest.json'), 'utf8')).key).toBe(
        manifest.key,
      );
      await work.page.locator('summary').filter({ hasText: 'Need the extension?' }).click();
      await work.page.screenshot({ path: testInfo.outputPath('login-transfer-approval.png') });
      let popup = await chrome.newPage();
      await popup.setViewportSize({ width: 392, height: 600 });
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.locator('#code').fill(code);
      const blank = !openSourceSite ? await chrome.newPage() : undefined;
      await (blank ?? source).bringToFront();
      // Opening the action popup leaves the source tab active in ordinary Chrome.
      await popup.locator('#connect').evaluate((button: HTMLButtonElement) => button.click());
      if (openSourceSite) await expect(popup.locator('#approval')).toBeVisible();
      else await expect(popup.locator('#approval')).toBeHidden();
      if (!openSourceSite) {
        await expect(
          popup.getByRole('button', { name: 'Open requested website', exact: true }),
        ).toBeInViewport({ ratio: 1 });
        const opened = chrome.waitForEvent('page');
        await popup.getByRole('button', { name: 'Open requested website', exact: true }).click();
        const requested = await opened;
        await expect(requested).toHaveURL(origin + '/');
        source = requested;
        await source.goto(sourceOrigin + '/source');
        // Destroy the popup as Chrome does on navigation, then open a new one.
        await popup.close();
        popup = await chrome.newPage();
        await popup.setViewportSize({ width: 392, height: 600 });
        await source.bringToFront();
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        await expect(popup.locator('#code')).toHaveValue(code);
        await expect(popup.locator('#approval')).toBeVisible();
      }

      expect(
        await work.app().evaluate(async ({ BrowserWindow }) => {
          const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
            -1,
          ) as import('electron').WebContentsView;
          return (await view.webContents.session.cookies.get({ name: 'extension-login' })).length;
        }),
      ).toBe(0);
      if (openSourceSite) {
        await expect(popup.locator('#source-switch')).toBeVisible();
        await expect(popup.locator('#source-switch')).toContainText(sourceOrigin);
        await popup.getByRole('button', { name: 'Approve and transfer' }).click();
        await expect(popup.locator('#status')).toContainText('Approve opening');
        await popup.locator('#open-source-site').check();
      }
      await popup.screenshot({ path: testInfo.outputPath('extension-approval.png') });
      await popup.locator('#localStorage').check();
      await popup.locator('#sessionStorage').check();
      await expect(popup.getByRole('button', { name: 'Approve and transfer' })).toBeInViewport({
        ratio: 1,
      });
      await popup.getByRole('button', { name: 'Approve and transfer' }).click();
      if (!openSourceSite) {
        await expect(popup.locator('#status')).toContainText('Transferring');
        await expect
          .poll(() =>
            popup.evaluate(
              async () =>
                (await (window as any).chrome.storage.session.get('transferStatus')).transferStatus
                  ?.state,
            ),
          )
          .toBe('transferring');
        // Returning to Dextana closes the action popup. The approved upload must survive.
        await popup.close();
      } else
        await expect(popup.locator('#status')).toContainText('Transferred.', { timeout: 30_000 });
      await expect(work.page.getByText('Login state transferred.')).toBeVisible();
      await expect(
        work.page.getByRole('dialog', { name: 'Use login from my browser' }),
      ).toBeHidden();
      expect(
        await work.app().evaluate(({ BrowserWindow }) => {
          const host = BrowserWindow.getAllWindows().find((w) => !w.getParentWindow())!;
          return (
            host.contentView.children.at(-1) as import('electron').WebContentsView
          ).getVisible();
        }),
      ).toBe(true);
      await work.page.screenshot({ path: testInfo.outputPath('login-transfer-notice.png') });
      await work.page.getByRole('button', { name: 'Done', exact: true }).click();
      const imported = await work.app().evaluate(async ({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
          -1,
        ) as import('electron').WebContentsView;
        return {
          title: view.webContents.getTitle(),
          value: (await view.webContents.session.cookies.get({ name: 'extension-login' }))[0]
            ?.value,
        };
      });
      expect(imported).toEqual({ title: 'Transferred from Chrome', value: 'synthetic-http-only' });
      if (openSourceSite)
        await expect(work.page.getByLabel('Activity browser address')).toHaveValue(
          sourceOrigin + '/source',
        );
      if (!openSourceSite) {
        popup = await chrome.newPage();
        await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        await expect(popup.locator('#status')).toContainText('Transferred.');
        const saved = await popup.evaluate(() => (window as any).chrome.storage.session.get(null));
        expect(saved.connectionCode).toBeUndefined();
        expect(JSON.stringify(saved)).not.toContain('synthetic-http-only');
      }
      expect(await source.evaluate(() => sessionStorage.getItem('tab'))).toBe('from-source-tab');
      expect(JSON.stringify(work.calls)).not.toContain('synthetic-http-only');
      await work.page.screenshot({ path: testInfo.outputPath('login-transfer-complete.png') });
    } finally {
      await work.app().evaluate(({ shell, clipboard }) => {
        const state = globalThis as any;
        if (state.restoreExtensionUI) {
          shell.openPath = state.restoreExtensionUI.openPath;
          clipboard.writeText = state.restoreExtensionUI.writeText;
          delete state.restoreExtensionUI;
        }
      });
      await chrome.close();
      await work.close();
      site.closeAllConnections();
      await new Promise<void>((resolve) => site.close(() => resolve()));
      await rm(extension, { recursive: true, force: true });
    }
  });
}
