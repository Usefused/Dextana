import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadDisplays } from '../helpers/download-display';
import { pdfDocument } from '../helpers/documents';
import { test, start, reply, allowBrowser } from './fixture';

function pageResult(value: any): any {
  if (typeof value === 'string') { try { return pageResult(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.elements)) return value;
  for (const nested of Object.values(value)) { const found = pageResult(nested); if (found) return found; }
}

function downloadResults(value: any): Record<string, unknown>[] | undefined {
  if (typeof value === 'string') { try { return downloadResults(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.downloads)) return value.downloads;
  for (const nested of Object.values(value)) { const found = downloadResults(nested); if (found) return found; }
}

test('browser renders an authenticated PDF and saves a real attachment with an honest receipt', async ({ workspace }) => {
  test.setTimeout(120_000);
  const pdf = pdfDocument('Dextana browser PDF receipt');
  let authenticatedRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Set-Cookie', 'browser-files=allowed; HttpOnly; SameSite=Lax');
      res.setHeader('Content-Type', 'text/html');
      return res.end('<h1>Documents</h1><a href="/inline.pdf">View receipt</a><a href="/attachment">Download receipt</a>');
    }
    if (!req.headers.cookie?.includes('browser-files=allowed')) { res.writeHead(401); return res.end('Sign in'); }
    authenticatedRequests++;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    if (req.url === '/attachment') res.setHeader('Content-Disposition', 'attachment; filename="receipt.pdf"');
    res.end(pdf);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  let tabReference = '';
  const work = await workspace((body, res) => {
    const userIndex = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[userIndex].content;
    const results = body.messages.slice(userIndex + 1).filter((m: any) => m.role === 'tool');
    const page = pageResult(results.at(-1)?.content);
    if (page?.tab_id) { tabReference = page.tab_id; expect(tabReference).toMatch(/^Tab \d+$/); }
    if (prompt.includes('Click attachment') && results.length < 2) {
      const observed = results.length ? pageResult(results[0].content) : undefined;
      const ref = observed?.elements.find((element: any) => element.tag === 'a' && element.label === 'Download receipt')?.ref;
      if (results.length) expect(ref).toBeTruthy();
      reply(body, res, '', [{ function: { name: 'browser', arguments: results.length ? { action: 'click', ref } : { action: 'read' } } }]);
    } else if (!results.length) {
      const action = prompt.includes('Check download status') ? 'downloads' : 'open';
      const url = prompt.includes('View PDF') ? `${origin}/inline.pdf` : prompt.includes('Download PDF') ? `${origin}/attachment` : origin;
      reply(body, res, '', [{ function: { name: 'browser', arguments: { action, ...(action === 'open' ? { url, ...(tabReference ? { tab_id: tabReference } : {}) } : {}) } } }]);
    } else {
      // Check the actual model input, before any presentation layer can change it.
      for (const result of results) {
        for (const record of downloadResults(result.content) ?? []) {
          expect(Object.keys(record).sort()).toEqual(
            ['filename', 'state', 'receivedBytes', 'totalBytes',
              ...(record.path === undefined ? [] : ['path']),
              ...(record.message === undefined ? [] : ['message'])].sort(),
          );
        }
      }
      if (prompt.includes('Check download status')) {
        const receipts = downloadResults(results.at(-1).content);
        expect(receipts?.length).toBeGreaterThan(0);
        reply(body, res, ['Download status', ...downloadDisplays(receipts!)].join('\n\n'));
      } else reply(body, res, `File browser receipt: ${results.at(-1).content}`);
    }
    return true;
  });
  const send = async (message: string) => {
    const before = await work.page.getByTestId('assistant-message').count();
    await work.page.getByLabel('Describe your work').fill(message);
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message')).toHaveCount(before + 1, { timeout: 45_000 });
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 45_000 });
  };
  try {
    await start(work.page, 'Open documents');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await send('View PDF');
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(`${origin}/inline.pdf`);
    // Inspect the actual Chromium viewer, not a MIME label or an empty embed.
    await expect.poll(() => work.app().evaluate(async ({ webContents }) => {
      for (const contents of webContents.getAllWebContents()) {
        for (const frame of contents.mainFrame.framesInSubtree) {
          try {
            const loaded = await frame.executeJavaScript('document.querySelector("pdf-viewer")?.getLoadSucceededForTesting?.() === true');
            if (loaded) return true;
          } catch { /* Frame can detach while the viewer starts. */ }
        }
      }
      return false;
    }), { timeout: 15_000 }).toBe(true);
    const destination = join(work.directory, 'receipt.pdf');
    // Automate only the OS save choice; the real session, request and DownloadItem run normally.
    await work.app().evaluate(({ webContents }, { origin, destination }) => {
      const page = webContents.getAllWebContents().find(w => w.getURL() === `${origin}/inline.pdf`)!;
      page.session.once('will-download', (_event, item) => item.setSavePath(destination));
    }, { origin, destination });
    await send('Download PDF');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Navigation started a download');
    await expect(work.page.getByTestId('assistant-message').last()).not.toContainText('ERR_FAILED');
    await expect.poll(async () => { try { return (await readFile(destination)).equals(pdf); } catch { return false; } }).toBe(true);
    await send('Check download status');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('completed');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(destination);
    await expect(work.page.getByTestId('assistant-message').last()).not.toContainText(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i);
    const message = work.page.getByTestId('assistant-message').last();
    await expect(message.getByRole('table')).toHaveCount(3);
    await expect(message.getByRole('cell', { name: 'receipt.pdf', exact: true })).toHaveCount(3);
    await expect(message.getByRole('cell', { name: 'completed', exact: true })).toHaveCount(3);
    expect(authenticatedRequests).toBeGreaterThanOrEqual(2);
    await work.page.getByRole('button', { name: 'Browser options', exact: true }).click();
    await work.page.getByRole('menuitem', { name: /Downloads/ }).click();
    await expect(work.page.getByRole('dialog', { name: 'Downloads' })).toContainText('receipt.pdf');
    await expect(work.page.getByRole('dialog', { name: 'Downloads' })).toContainText('Saved');
    await work.page.getByRole('button', { name: 'Close downloads' }).click();
    // Cancelled downloads must never be reported as saved.
    await work.app().evaluate(({ webContents }, origin) => {
      const page = webContents.getAllWebContents().find(w => w.getURL() === `${origin}/inline.pdf`)!;
      page.session.once('will-download', (_event, item) => item.cancel());
    }, origin);
    await send('Download PDF again');
    await send('Check download status');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('cancelled');
    await send('Open documents again');
    const clickedDestination = join(work.directory, 'clicked-receipt.pdf');
    await work.app().evaluate(({ webContents }, { origin, destination }) => {
      const page = webContents.getAllWebContents().find(w => w.getURL() === origin + '/')!;
      page.session.once('will-download', (_event, item) => item.setSavePath(destination));
    }, { origin, destination: clickedDestination });
    await send('Click attachment');
    await expect(work.page.getByTestId('assistant-message').last()).not.toContainText('Error:');
    await expect.poll(async () => { try { return (await readFile(clickedDestination)).equals(pdf); } catch { return false; } }).toBe(true);
  } finally {
    await work.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
