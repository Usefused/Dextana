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
  let inspectAfterTransfer = false;
  const work = await workspace((body, res) => {
    if (inspectAfterTransfer) {
      inspectAfterTransfer = false;
      reply(body, res, '', [{ function: { name: 'browser', arguments: { action: 'read' } } }]);
    } else if (!body.messages.some((m: any) => m.role === 'tool'))
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
    const transferredState = () =>
      work.app().evaluate(async ({ BrowserWindow }) => {
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
    await work.page.getByRole('button', { name: 'Browser options', exact: true }).click();
    await work.page.getByRole('menuitem', { name: 'Use login from my browser' }).click();
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
    await work.page.getByRole('button', { name: 'Browser options', exact: true }).click();
    await work.page.getByRole('menuitem', { name: 'Use login from my browser' }).click();
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
    inspectAfterTransfer = true;
    await work.page.getByLabel('Describe your work').fill('Inspect the transferred website');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect
      .poll(() =>
        work.calls.some((body: any) =>
          body.messages?.some(
            (message: any) =>
              message.role === 'tool' &&
              String(message.content).includes('Signed in') &&
              String(message.content).includes('elements'),
          ),
        ),
      )
      .toBe(true);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});

for (const { openSourceSite, staleInstall, closeForPermission } of [
  { openSourceSite: false, staleInstall: false, closeForPermission: false },
  { openSourceSite: true, staleInstall: false, closeForPermission: false },
  { openSourceSite: false, staleInstall: true, closeForPermission: false },
  { openSourceSite: false, staleInstall: false, closeForPermission: true },
]) {
  test(`the real Chromium extension approves and transfers a signed-in source tab${openSourceSite ? ' across a login redirect' : ''}${staleInstall ? ' after upgrading a stale installation' : ''}${closeForPermission ? ' when the permission prompt destroys the popup' : ''}`, async ({
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
    const installedManifest = { ...manifest };
    if (staleInstall) {
      installedManifest.version = '0.2.0';
      delete installedManifest.background;
    }
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(installedManifest));
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
      await work.page.getByRole('button', { name: 'Browser options', exact: true }).click();
    await work.page.getByRole('menuitem', { name: 'Use login from my browser' }).click();
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
      const popupErrors: string[] = [];
      popup.on('pageerror', (error) => popupErrors.push(error.message));
      // Refreshing unpacked files does not refresh Chrome's loaded manifest.
      if (staleInstall) await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
      await popup.setViewportSize({ width: 392, height: 600 });
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.locator('#code').fill(code);
      if (staleInstall) {
        await expect(popup.getByRole('status')).toContainText('extension needs to reload');
        await expect(popup.locator('#connect')).toBeDisabled();
        await expect(popup.locator('#approval')).toBeHidden();
        expect(
          await popup.evaluate(() =>
            (window as any).chrome.permissions.contains({
              origins: ['https://accounts.google.com/*'],
            }),
          ),
        ).toBe(false);
        expect(popupErrors).toEqual([]);
        const settingsOpened = chrome.waitForEvent('page');
        await popup.getByRole('button', { name: 'Open extension settings', exact: true }).click();
        const settings = await settingsOpened;
        await settings.waitForLoadState();
        await settings.locator('#devMode').click();
        await settings.getByRole('button', { name: 'Reload', exact: true }).click();
        await settings.close();
        await popup.close();
        popup = await chrome.newPage();
        await popup.setViewportSize({ width: 392, height: 600 });
        await expect(async () => {
          await popup.goto(`chrome-extension://${extensionId}/popup.html`);
        }).toPass({ timeout: 10_000 });
        // Chrome clears session storage on reload. Pair again without ever
        // persisting this short-lived credential in durable extension storage.
        await expect(popup.locator('#code')).toHaveValue('');
        await popup.locator('#code').fill(code);
        await expect(popup.locator('#reload-extension')).toBeHidden();
        await expect(popup.locator('#connect')).toBeEnabled();
        await popup.locator('#pairing').evaluate((element: HTMLDetailsElement) => {
          element.open = true;
        });
      }
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
        await expect(
          popup.getByRole('button', { name: 'Transfer login and open this site' }),
        ).toBeVisible();
      }
      await popup.screenshot({ path: testInfo.outputPath('extension-approval.png') });
      await popup.getByText('More data (optional)', { exact: true }).click();
      await popup.locator('#localStorage').check();
      await popup.locator('#sessionStorage').check();
      await popup.getByText('More data (optional)', { exact: true }).click();
      const approveTransfer = popup.getByRole('button', {
        name: openSourceSite ? 'Transfer login and open this site' : 'Approve and transfer',
      });
      await expect(approveTransfer).toBeInViewport({
        ratio: 1,
      });
      if (closeForPermission) {
        // Access is pre-granted only in this synthetic fixture. Reproduce the
        // lost callback: Chrome's prompt outlives the action popup, so request()
        // never resolves there. Capture/import must already belong to the worker.
        await popup.evaluate(() => {
          (window as any).chrome.permissions.request = () => new Promise(() => {});
        });
      }
      await approveTransfer.click();
      if (closeForPermission) await popup.close();
      else if (!openSourceSite) {
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
