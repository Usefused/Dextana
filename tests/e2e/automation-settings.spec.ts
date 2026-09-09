import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('global browser defaults, chat overrides and background preference persist across restart', async ({ workspace }, info) => {
  test.setTimeout(120_000);
  const work = await workspace();
  const sections = () => work.page.getByRole('navigation', { name: 'Settings sections' });
  const openBrowserSettings = async () => {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sections().getByRole('button', { name: 'Browser use', exact: true }).click();
  };
  try {
    await start(work.page, 'Browser default chat');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Completed');
    const first = (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(item => item.title === 'Browser default chat')!.id;
    await start(work.page, 'Browser override chat');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Completed');
    const second = (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(item => item.title === 'Browser override chat')!.id;
    await openBrowserSettings();
    const toggle = () => work.page.getByRole('switch', { name: 'Automatically approve browser actions by default' });
    await expect(toggle()).not.toBeChecked();
    await toggle().click();
    await expect(work.page.getByText('Global browser default saved.')).toBeVisible();
    await work.page.getByLabel('Browser use chat').selectOption(second);
    await expect(work.page.getByLabel('Browser approvals', { exact: true })).toHaveValue('default');
    await work.page.getByLabel('Browser approvals', { exact: true }).selectOption('ask');
    await expect.poll(async () => (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(item => item.id === second)?.permissions?.browser).toBe(false);
    await work.page.getByLabel('Browser use chat').selectOption(first);
    await expect(work.page.getByLabel('Browser approvals', { exact: true })).toHaveValue('default');
    await expect(work.page.getByLabel('Browser approvals', { exact: true }).locator('option:checked')).toContainText('Automatically approve');
    await work.page.screenshot({ path: info.outputPath('browser-settings.png') });
    await sections().getByRole('button', { name: 'Background service', exact: true }).click();
    const background = () => work.page.getByRole('switch', { name: 'Keep Dextana running when its window closes' });
    await expect(background()).toBeChecked();
    await background().click();
    await expect(work.page.getByText('Background preference saved.')).toBeVisible();
    await work.restart();
    const saved = await work.page.evaluate(() => window.dextana.snapshot());
    expect(saved.browserPreferences?.autoAllow).toBe(true);
    expect(saved.desktopBackground).toBe(false);
    expect(saved.activities.find(item => item.id === first)?.permissions?.browser).toBeUndefined();
    expect(saved.activities.find(item => item.id === second)?.permissions?.browser).toBe(false);
    await openBrowserSettings();
    await expect(toggle()).toBeChecked();
    await work.page.getByLabel('Browser use chat').selectOption(second);
    await expect(work.page.getByLabel('Browser approvals', { exact: true })).toHaveValue('ask');
    await work.page.getByRole('button', { name: 'Open chat', exact: true }).click();
    await work.page.getByRole('button', { name: 'Chat settings', exact: true }).click();
    await expect(work.page.getByLabel('Browser approvals', { exact: true })).toHaveValue('ask');
    await work.page.getByLabel('Browser approvals', { exact: true }).selectOption('default');
    await expect.poll(async () => (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(item => item.id === second)?.permissions?.browser).toBeUndefined();
    await work.page.keyboard.press('Escape');
    await openBrowserSettings();
    await toggle().click();
    await expect(work.page.getByText('Global browser default saved.')).toBeVisible();
    await expect(work.page.getByLabel('Browser approvals', { exact: true }).locator('option:checked')).toContainText('Ask for approval');
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 760));
    expect(await work.page.locator('.settings-panel').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await work.page.screenshot({ path: info.outputPath('browser-settings-narrow.png') });
    await work.page.getByLabel('Search settings').fill('background');
    await expect(sections().getByRole('button', { name: 'Models', exact: true })).toHaveCount(0);
    await sections().getByRole('button', { name: 'Background service', exact: true }).click();
    await expect(background()).not.toBeChecked();
  } finally {
    await work.page.evaluate(async () => {
      await window.dextana.setBrowserPreferences({ autoAllow: false });
      await window.dextana.setDesktopBackground(true);
    });
    await work.close();
  }
});
