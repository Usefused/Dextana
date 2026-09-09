import { expect } from '@playwright/test';
import { test } from './fixture';

test('desktop features preserve Scheduled jobs and use bounded shared layouts in narrow windows', async ({ workspace }, testInfo) => {
  const work = await workspace();
  try {
    await work.page.getByLabel('Workspace view').selectOption('cron');
    await expect(work.page.getByRole('button', { name: 'New deferred task', exact: true })).toBeVisible();
    await expect(work.page.getByRole('region', { name: 'Desktop timers and reminders' })).toHaveCount(0);
    await work.page.screenshot({ path: testInfo.outputPath('scheduled-jobs-restored.png') });
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    await expect(work.page.getByRole('button', { name: 'New timer', exact: true })).toBeVisible();
    await expect(work.page.getByLabel('Desktop alarm title')).toHaveCount(0);
    await work.page.getByRole('button', { name: 'Workflows', exact: true }).click();
    await expect(work.page.getByRole('region', { name: 'Desktop workflows', exact: true })).toBeVisible();
    await expect(work.page.getByRole('region', { name: 'Desktop timers and reminders' })).toHaveCount(0);
    await work.page.getByRole('button', { name: 'Timers and reminders', exact: true }).click();
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 760));
    const layout = work.page.locator('.desktop-workspace');
    const content = work.page.locator('.desktop-workspace-content');
    const outer = (await layout.boundingBox())!;
    const inner = (await content.boundingBox())!;
    expect(inner.x - outer.x).toBeGreaterThanOrEqual(24);
    expect(outer.x + outer.width - inner.x - inner.width).toBeGreaterThanOrEqual(24);
    expect(await layout.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await work.page.screenshot({ path: testInfo.outputPath('desktop-narrow.png') });
  } finally { await work.close(); }
});
