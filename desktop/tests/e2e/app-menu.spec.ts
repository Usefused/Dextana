import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('the application Settings menu opens the sidebar settings and preserves the current chat and drafts', async ({ workspace }) => {
  const work = await workspace();
  const openFromMenu = () => work.app().evaluate(({ Menu, BrowserWindow }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('open-settings');
    if (!item) throw new Error('The application menu has no Settings item');
    item.click(item, BrowserWindow.getAllWindows()[0], {} as Electron.KeyboardEvent);
    return { label: item.label, accelerator: item.accelerator };
  });
  try {
    await start(work.page, 'Check the application settings menu');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await work.page.getByLabel('Describe your work').fill('Keep this draft');
    expect(await openFromMenu()).toEqual({ label: 'Settings…', accelerator: 'CommandOrControl+,' });
    const navigation = work.page.getByRole('navigation', { name: 'Settings sections' });
    await expect(navigation).toBeVisible();
    await expect(work.page.getByLabel('Ollama address')).toBeVisible();
    await work.page.getByLabel('Ollama address').fill('http://localhost:12345');
    await openFromMenu();
    await expect(work.page.getByLabel('Ollama address')).toHaveValue('http://localhost:12345');
    await work.page.getByRole('button', { name: 'Back to chats' }).click();
    await expect(work.page.getByRole('heading', { name: 'Check the application settings menu', exact: true })).toBeVisible();
    await expect(work.page.getByLabel('Describe your work')).toHaveValue('Keep this draft');
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Models', exact: true })).toHaveAttribute('aria-current', 'page');
    await work.page.getByRole('button', { name: 'Back to chats' }).click();
  } finally { await work.close(); }
});
