import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('folders group chats, persist across restart, and can be removed without losing history', async ({ workspace }) => {
  test.setTimeout(120_000);
  const work = await workspace();
  try {
    await start(work.page, 'Prepare project notes');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await work.page.getByRole('button', { name: 'New folder', exact: true }).click();
    await work.page.getByLabel('Folder name', { exact: true }).fill('Projects');
    await work.page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(work.page.getByRole('status')).toContainText('Folder created');
    await work.page.getByLabel('Conversation folder').selectOption({ label: 'Projects' });
    const folder = work.page.getByRole('region', { name: 'Folder Projects', exact: true });
    await expect(
      folder.getByRole('button', { name: 'Prepare project notes', exact: true }),
    ).toBeVisible();
    await folder.locator('.folder-heading').hover();
    await folder.getByLabel('Manage folder Projects').click();
    await expect(folder.getByRole('button', { name: 'Rename folder' })).toBeVisible();
    await work.page.getByLabel('Describe your work').click();
    await expect(folder.getByRole('button', { name: 'Rename folder' })).not.toBeVisible();
    await folder.locator('.folder-heading').hover();
    await folder.getByLabel('Manage folder Projects').click();
    await work.page.keyboard.press('Escape');
    await expect(folder.getByRole('button', { name: 'Rename folder' })).not.toBeVisible();
    await folder.getByRole('button', { name: 'New chat in Projects', exact: true }).click();
    await expect(work.page.locator('header')).toContainText('New chat · Projects');
    await work.page.getByLabel('Describe your work').fill('New conversation inside Projects');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 30_000 });
    await expect(folder.getByRole('button', { name: 'New conversation inside Projects', exact: true })).toBeVisible();
    await folder.locator('.folder-toggle').click();
    await expect(
      folder.getByRole('button', { name: 'Prepare project notes', exact: true }),
    ).toHaveCount(0);
    const page = await work.restart();
    const restoredFolder = page.getByRole('region', { name: 'Folder Projects', exact: true });
    await expect(restoredFolder.locator('.folder-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await restoredFolder.locator('.folder-toggle').click();
    await expect(restoredFolder.getByRole('button', { name: 'New conversation inside Projects', exact: true })).toBeVisible();
    await restoredFolder
      .getByRole('button', { name: 'Prepare project notes', exact: true })
      .click();
    await expect(page.getByTestId('assistant-message')).toContainText('Completed by');
    await restoredFolder.locator('.folder-heading').hover();
    await restoredFolder.getByLabel('Manage folder Projects').click();
    await page.screenshot({ path: '/tmp/dext-folder-menu.png' });
    await restoredFolder.getByRole('button', { name: 'Rename folder' }).click();
    await restoredFolder.getByLabel('Folder name').fill('Client work');
    await restoredFolder.getByRole('button', { name: 'Save', exact: true }).click();
    const renamed = page.getByRole('region', { name: 'Folder Client work', exact: true });
    await expect(renamed).toBeVisible();
    await renamed.locator('.folder-heading').hover();
    await renamed.getByLabel('Manage folder Client work').click();
    await renamed.getByRole('button', { name: 'Remove folder' }).click();
    await expect(renamed).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Prepare project notes', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Conversation folder')).toHaveValue('');
    await expect(page.getByTestId('assistant-message')).toContainText('Completed by');
    const state = await page.evaluate(() => window.dextana.snapshot());
    expect(state.activities.find(activity => activity.title === 'Prepare project notes')?.folderId).toBeUndefined();
  } finally {
    await work.close();
  }
});
