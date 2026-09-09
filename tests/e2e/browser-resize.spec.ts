import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start } from './fixture';

test('browser divider resizes the native page, clamps, resets and remembers width', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<title>Resize check</title><button onclick="this.textContent=\'Clicked\'">Check page</button>');
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const work = await workspace();
  const originalSize = await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
  try {
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900));
    await start(work.page, 'Resize browser pane');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    const state = await work.page.evaluate(() => window.dextana.snapshot());
    const id = state.activities.find(a => a.title === 'Resize browser pane')!.id;
    const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
    await work.page.evaluate(({ id, url }) => window.dextana.newBrowserTab(id, url), { id, url });
    const divider = () => work.page.getByRole('separator', { name: 'Resize browser' });
    const pane = () => work.page.getByRole('complementary', { name: 'In-app browser' });
    const nativeBounds = () => work.app().evaluate(({ BrowserWindow }, url) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children.find((v: any) => v.webContents?.getURL() === url)!;
      return { ...view.getBounds(), visible: view.getVisible() };
    }, url);
    const aligned = async () => {
      const box = (await pane().boundingBox())!;
      await expect.poll(async () => {
        const bounds = await nativeBounds();
        return Math.abs(bounds.x - box.x) + Math.abs(bounds.width - box.width);
      }).toBeLessThan(2);
      expect((await nativeBounds()).visible).toBe(true);
    };
    await expect(divider()).toBeVisible();
    const initial = Number(await divider().getAttribute('aria-valuenow'));
    const box = (await divider().boundingBox())!;
    await work.page.mouse.move(box.x + 4, 320);
    await work.page.mouse.down();
    await work.page.mouse.move(box.x - 196, 320, { steps: 12 });
    await work.page.mouse.up();
    await expect(divider()).toHaveAttribute('aria-valuenow', String(initial + 200));
    await aligned();
    // Drag right across the former native surface: pointer events must remain in the app.
    const expanded = (await divider().boundingBox())!;
    await work.page.mouse.move(expanded.x + 4, 320);
    await work.page.mouse.down();
    await work.page.mouse.move(expanded.x + 104, 320, { steps: 10 });
    await work.page.mouse.up();
    await expect(divider()).toHaveAttribute('aria-valuenow', String(initial + 100));
    await aligned();
    await divider().focus();
    await work.page.keyboard.press('ArrowLeft');
    await expect(divider()).toHaveAttribute('aria-valuenow', String(initial + 120));
    await work.page.getByRole('button', { name: 'Close browser pane' }).click();
    await work.page.evaluate(id => window.dextana.showBrowser(id), id);
    await expect(divider()).toHaveAttribute('aria-valuenow', String(initial + 120));
    await work.restart();
    await work.page.evaluate(id => window.dextana.selectActivity(id), id);
    await work.page.getByRole('button', { name: 'Resize browser pane', exact: true }).click();
    await work.page.evaluate(id => window.dextana.showBrowser(id), id);
    await expect(divider()).toHaveAttribute('aria-valuenow', String(initial + 120));
    await aligned();
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(940, 760));
    await expect(divider()).toHaveAttribute('aria-valuenow', '365');
    await aligned();
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900));
    await expect(divider()).toHaveAttribute('aria-valuenow', String(initial + 120));
    await divider().focus();
    await work.page.keyboard.press('Home');
    await expect(divider()).toHaveAttribute('aria-valuenow', '320');
    await work.page.keyboard.press('End');
    await expect(divider()).toHaveAttribute('aria-valuenow', '792');
    await aligned();
    await divider().dblclick({ position: { x: 4, y: 250 } });
    await expect(divider()).toHaveAttribute('aria-valuenow', '480');
    await aligned();
    const page = work.app().windows().find(p => p.url() === url);
    expect(page).toBeDefined();
    await page!.getByRole('button', { name: 'Check page' }).click();
    await expect(page!.getByRole('button', { name: 'Clicked' })).toBeVisible();
    await work.page.screenshot({ path: test.info().outputPath('browser-resized.png') });
  } finally {
    await work.page.evaluate(() => localStorage.removeItem('dextana.browser-width'));
    await work.page.evaluate(() => window.dextana.hideBrowser());
    await work.app().evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), originalSize);
    await work.close();
    site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});
