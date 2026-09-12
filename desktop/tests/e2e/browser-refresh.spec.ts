import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start } from './fixture';

test('refresh reloads the selected browser tab without creating another tab', async ({ workspace }) => {
  test.setTimeout(120_000);
  let loads = 0;
  const site = createServer((req, res) => {
    if (req.url === '/') loads++;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<title>Refresh check</title><p>Load ${loads}</p>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const work = await workspace();
  try {
    await start(work.page, 'Check browser refresh');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    const state = await work.page.evaluate(() => window.dextana.snapshot());
    const id = state.activities.find(a => a.title === 'Check browser refresh')!.id;
    const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
    await work.page.evaluate(({ id, url }) => window.dextana.newBrowserTab(id, url), { id, url });
    await expect.poll(() => loads).toBe(1);
    const before = await work.page.evaluate(async () => (await window.dextana.snapshot()).browser!);
    const refresh = work.page.getByRole('button', { name: 'Refresh page', exact: true });
    await refresh.click();
    await expect.poll(() => loads).toBe(2);
    await expect(refresh).toBeEnabled();
    const after = await work.page.evaluate(async () => (await window.dextana.snapshot()).browser!);
    expect(after.tabId).toBe(before.tabId);
    expect(after.tabs.length).toBe(before.tabs.length);
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url);
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});
