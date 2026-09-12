import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

/** Real packaged extension and a disposable browser profile; no personal browser data. */
export async function browserFixture(options: { html?: string; offline?: boolean } = {}) {
  const server = createServer((req, res) => {
    if (req.url === '/fixture-download.pdf') {
      const body = Buffer.from('%PDF-1.4\n% Dextana browser download fixture\n%%EOF\n');
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="fixture-download.pdf"',
        'Content-Length': body.length,
      });
      res.end(body);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      options.html ??
        `<!doctype html><title>Browser action fixture</title>
      <h1>Review draft</h1><label>Draft title<input id="title" value="Original"></label>
      <button id="save">Save draft</button><p id="result"></p><input type="password" value="private-fixture-value">
      <script>
        window.events=[];
        title.addEventListener('input',event=>events.push({kind:'input',trusted:event.isTrusted}));
        save.onclick=event=>{events.push({kind:'click',trusted:event.isTrusted});result.textContent='Saved: '+document.querySelector('#title').value;};
      </script>`,
    );
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const extension = resolve('browser-extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      ...(options.offline
        ? ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']
        : []),
    ],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(origin);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  const errors: string[] = [];
  popup.on('pageerror', (error) => errors.push(error.message));
  async function attach(code: string, selectedURLs: string[] | 'browser' = [page.url()]) {
    await popup.locator('#code').fill(code);
    await page.bringToFront();
    // The popup remains open in a fixture tab while the source tab is active.
    // This runs the shipped connect handler, which queries the actual active tab.
    await popup.evaluate(() => (document.getElementById('connect') as HTMLButtonElement).click());
    await expect(popup.locator('#control-approve')).toBeVisible();
    await popup.locator('#control-granular').setChecked(selectedURLs !== 'browser');
    if (Array.isArray(selectedURLs)) {
      for (const row of await popup.locator('#control-tabs label').all())
        await row
          .locator('input')
          .setChecked(selectedURLs.includes((await row.getAttribute('title')) ?? ''));
    }
    await popup.locator('#control-approve').click();
    await expect(popup.locator('#control-stop'), {
      message: await popup.locator('#status').innerText(),
    }).toBeVisible();
  }
  return {
    context,
    worker,
    id,
    page,
    popup,
    origin,
    attach,
    errors,
    close: async () => {
      await context.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}
