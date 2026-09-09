import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('context stays compact in a narrow conversation and can be minimized and restored', async ({ workspace }) => {
  test.setTimeout(120_000);
  const work = await workspace();
  const original = await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  try {
    await work.page.getByRole('button', { name: 'New folder', exact: true }).click();
    const editor = work.page.locator('.folder-editor');
    const field = editor.getByLabel('Folder name', { exact: true });
    await expect(field).toBeFocused();
    const fieldBox = (await field.boundingBox())!;
    const sidebarBox = (await work.page.locator('.sidebar').boundingBox())!;
    expect(fieldBox.x + fieldBox.width).toBeLessThan(sidebarBox.x + sidebarBox.width);
    expect(fieldBox.height).toBeLessThanOrEqual(34);
    await editor.screenshot({ path: '/private/tmp/dext-folder-editor.png' });
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await start(work.page, 'Keep my context separate');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
    const panel = work.page.getByRole('region', { name: 'Agent context', exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Minimize context' })).toHaveCount(0);
    await panel.locator('summary').filter({ hasText: 'Links' }).click();
    const settings = work.page.getByRole('button', { name: 'Chat settings', exact: true });
    await settings.click();
    const approvals = work.page.getByLabel('Session approvals');
    await approvals.selectOption('allow');
    await expect(approvals).toHaveValue('allow');
    await approvals.selectOption('ask');
    await expect(approvals).toHaveValue('ask');
    await work.page.getByRole('dialog', { name: 'Chat settings', exact: true }).screenshot({ path: '/private/tmp/dext-chat-settings.png' });
    const toggle = work.page.getByRole('switch', { name: 'Show context' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(panel).toBeHidden();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('details').filter({ hasText: 'Links' })).toHaveAttribute('open', '');
    await settings.click();
    const state = await work.page.evaluate(() => window.dextana.snapshot());
    const id = state.activities.find(a => a.title === 'Keep my context separate')!.id;
    await work.page.evaluate(({ id, url }) => window.dextana.newBrowserTab(id, url), { id, url: `http://127.0.0.1:${work.port}/api/tags` });
    await expect(work.page.locator('.shell')).toHaveClass(/with-browser/);
    await expect.poll(async () => {
      const box = await panel.boundingBox();
      const layout = await work.page.locator('.conversation-layout').boundingBox();
      const transcript = await work.page.locator('.transcript-shell').boundingBox();
      return !!box && !!layout && !!transcript && box.width <= 262 && box.width < layout.width - 30 && box.height >= 300;
    }).toBe(true);
    await work.page.screenshot({ path: '/private/tmp/dextana-context-compact.png' });
    await work.page.getByRole('button', { name: 'Use login from my browser', exact: true }).click();
    const dialog = work.page.getByRole('dialog', { name: 'Use login from my browser' });
    await expect(dialog).toBeVisible();
    // Hit testing verifies the modal shields the floating Context card, not just its centre.
    await expect.poll(() => panel.evaluate(element => {
      const box = element.getBoundingClientRect();
      return [[box.left + 5, box.top + 5], [box.right - 5, box.bottom - 5]].every(([x, y]) =>
        !!document.elementFromPoint(x, y)?.closest('dialog.login-transfer-modal'));
    })).toBe(true);
    await dialog.getByRole('button', { name: 'Cancel transfer', exact: true }).click();
    await expect(dialog).toBeHidden();
    await settings.click();
    await toggle.click();
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();
  } finally {
    await work.page.evaluate(() => window.dextana.hideBrowser());
    await work.app().evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), original);
    await work.close();
  }
});
