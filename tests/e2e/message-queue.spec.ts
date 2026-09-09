import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('queued messages can be edited and deleted during a run and after restart', async ({
  workspace,
}, info) => {
  test.setTimeout(90_000);
  const work = await workspace();
  try {
    await start(work.page, 'Wait until cancelled: queue editing');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Running');
    await expect.poll(() => work.calls.length, { timeout: 60_000 }).toBeGreaterThan(0);
    for (const prompt of [
      'Remove this queued request',
      'Original queued request',
      'Keep the last request',
    ]) {
      await work.page.getByLabel('Describe your work').fill(prompt);
      await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    }
    let queue = work.page.getByRole('region', { name: 'Queued messages' });
    await expect(queue.locator('.queued-message')).toHaveCount(3);
    const calls = work.calls.length;
    await queue.getByRole('button', { name: 'Edit queued message 2', exact: true }).click();
    const editor = queue.getByRole('textbox', { name: 'Edit queued message', exact: true });
    await expect(editor).toBeFocused();
    await editor.fill('Discard this edit');
    await editor.press('Escape');
    await expect(queue).toContainText('Original queued request');
    await queue.getByRole('button', { name: 'Edit queued message 2', exact: true }).click();
    await editor.fill('');
    await expect(queue.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    await editor.fill('Revised queued request');
    await queue.screenshot({ path: info.outputPath('queue-editor.png') });
    await editor.press('Control+Enter');
    await expect(editor).toHaveCount(0);
    await expect(queue).toContainText('Revised queued request');
    await queue.getByRole('button', { name: 'Delete queued message 1', exact: true }).click();
    await expect(queue.locator('.queued-message')).toHaveCount(2);
    await expect(queue).not.toContainText('Remove this queued request');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Running');
    expect(work.calls.length).toBe(calls);
    await work.page.getByRole('button', { name: 'Stop activity', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await work.restart();
    queue = work.page.getByRole('region', { name: 'Queued messages' });
    await work.page
      .getByRole('button', { name: 'Wait until cancelled: queue editing', exact: true })
      .click();
    await expect(queue.locator('.queued-message p')).toHaveText([
      'Revised queued request',
      'Keep the last request',
    ]);
    await queue.getByRole('button', { name: 'Delete queued message 2', exact: true }).click();
    await expect(queue.locator('.queued-message')).toHaveCount(1);
    await queue.getByRole('button', { name: 'Steer', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(queue).toHaveCount(0);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Revised queued request',
    );
    const latest = work.calls.at(-1).messages;
    expect(latest.filter((message: any) => message.role === 'user').at(-1).content).toContain(
      'Revised queued request',
    );
    expect(JSON.stringify(latest)).not.toContain('Remove this queued request');
    expect(JSON.stringify(latest)).not.toContain('Original queued request');
  } finally {
    await work.close();
  }
});
