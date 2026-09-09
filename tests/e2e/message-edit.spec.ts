import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('latest message can be edited and resent without retaining the replaced response', async ({ workspace }, info) => {
  const work = await workspace();
  try {
    await start(work.page, 'Keep this earlier exchange');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await work.page.getByLabel('Describe your work').fill('Original latest request');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Original latest request');
    const before = await work.page.evaluate(async () => (await window.dextana.snapshot()).activities[0]);
    const lastUser = before.messages.findLast(message => message.role === 'user')!;
    let edit = work.page.getByRole('button', { name: 'Edit last message', exact: true });
    await expect(edit).toHaveCount(1);
    const latestMessage = work.page.locator('.message.user').last();
    const actions = latestMessage.locator('.message-hover-actions');
    await work.page.getByRole('heading', { name: 'Keep this earlier exchange', exact: true }).hover();
    await expect(actions).toHaveCSS('opacity', '0');
    await latestMessage.locator('.message-bubble').hover();
    await expect(actions).toHaveCSS('opacity', '1');
    const bubble = (await latestMessage.locator('.message-bubble').boundingBox())!;
    const button = (await edit.boundingBox())!;
    expect(button.y).toBeGreaterThanOrEqual(bubble.y + bubble.height);
    expect(button.x + button.width).toBeCloseTo(bubble.x + bubble.width, 0);
    await edit.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(edit).toHaveText('');
    await expect(edit.locator('svg')).toHaveCount(1);
    await expect(edit).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(edit).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    await latestMessage.screenshot({ path: info.outputPath('message-hover-edit.png') });
    await work.page.getByRole('heading', { name: 'Keep this earlier exchange', exact: true }).hover();
    await edit.focus();
    await expect(actions).toHaveCSS('opacity', '1');
    await edit.click();
    const input = work.page.getByRole('textbox', { name: 'Edit your last message', exact: true });
    await expect(input).toBeFocused();
    await input.fill('Discard this change');
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(work.page.locator('.message.user').last()).toContainText('Original latest request');
    await latestMessage.hover();
    await edit.click();
    await input.fill('');
    await expect(work.page.getByRole('button', { name: 'Save and resend' })).toBeDisabled();
    await input.fill('Revised latest request');
    await work.page.locator('.message-editing').screenshot({ path: info.outputPath('edit-last-message.png') });
    await input.press('Control+Enter');
    await expect(input).toHaveCount(0);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Revised latest request');
    await expect(work.page.getByTestId('assistant-message')).toHaveCount(2);
    const after = await work.page.evaluate(async () => (await window.dextana.snapshot()).activities[0]);
    expect(after.messages.slice(0, 2)).toEqual(before.messages.slice(0, 2));
    expect(after.messages[2]).toMatchObject({ id: lastUser.id, content: 'Revised latest request' });
    expect(after.messages[2].editedAt).toBeTruthy();
    const modelInput = JSON.stringify(work.calls.at(-1).messages);
    expect(modelInput).toContain('Keep this earlier exchange');
    expect(modelInput).not.toContain('Original latest request');
    await expect(work.page.evaluate(input => window.dextana.editMessage(input), {
      activityId: after.id, messageId: before.messages[0].id, prompt: 'Stale edit',
    })).rejects.toThrow('Only your latest message');
    await work.restart();
    edit = work.page.getByRole('button', { name: 'Edit last message', exact: true });
    await work.page.getByRole('button', { name: 'Keep this earlier exchange', exact: true }).click();
    await expect(work.page.locator('.message.user').last()).toContainText('Revised latest request');
    await expect(work.page.locator('.message.user').last()).toContainText('Edited');
    await work.page.getByLabel('Describe your work').fill('Wait until cancelled');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Running');
    await expect(edit).toBeDisabled();
    const active = await work.page.evaluate(async id => (await window.dextana.snapshot()).activities.find(a => a.id === id)!, after.id);
    await expect(work.page.evaluate(input => window.dextana.editMessage(input), {
      activityId: active.id, messageId: active.messages.findLast(message => message.role === 'user')!.id, prompt: 'Edit during execution',
    })).rejects.toThrow('Stop the current run');
    await work.page.evaluate(id => window.dextana.cancel(id), after.id);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await expect(edit).toBeEnabled();
  } finally {
    await work.close();
  }
});
