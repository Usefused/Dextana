import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('activity controls pause, resume and steer queued work while another activity remains usable', async ({ workspace }) => {
  test.setTimeout(120_000);
  const work = await workspace((body, res) => {
    const latest = body.messages.filter((message: any) => message.role === 'user').at(-1)?.content ?? '';
    if (latest.includes('Prepare next task')) return false;
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.write('\n');
    return true;
  });
  try {
    await start(work.page, 'Wait until cancelled');
    await expect.poll(() => work.calls.length, { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(work.page.getByRole('button', { name: 'Pause activity', exact: true })).toHaveCount(0);
    await work.page.getByRole('button', { name: 'Stop activity' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await expect(work.page.locator('.composer-footer > .send')).toHaveAttribute('data-state', 'resume');
    const beforeResume = work.calls.length;
    await work.page.getByRole('button', { name: 'Resume activity' }).click();
    await expect.poll(() => work.calls.length).toBeGreaterThan(beforeResume);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Running');
    for (const prompt of ['Keep this queued', 'Apply this correction now']) {
      await work.page.getByLabel('Describe your work').fill(prompt);
      await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    }
    const queue = work.page.getByLabel('Queued messages');
    await expect(queue.locator('.queued-message')).toHaveCount(2);
    const beforeSteer = work.calls.length;
    await queue.locator('.queued-message').filter({ hasText: 'Apply this correction now' }).getByRole('button', { name: 'Steer', exact: true }).click();
    await expect.poll(() => work.calls.length).toBeGreaterThan(beforeSteer);
    await expect(queue.locator('.queued-message')).toHaveCount(1);
    await expect(queue).toContainText('Keep this queued');
    await work.page.getByRole('button', { name: 'Stop activity', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await expect(queue).toContainText('Queue paused');
    const beforeQueueResume = work.calls.length;
    await work.page.getByRole('button', { name: 'Resume activity' }).click();
    await expect.poll(() => work.calls.length).toBeGreaterThan(beforeQueueResume);
    await expect(queue).toHaveCount(0);
    expect(work.calls.at(-1).messages.filter((message: any) => message.role === 'user').at(-1).content).toContain('Keep this queued');
    await work.page.getByRole('button', { name: 'Stop activity' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await start(work.page, 'Prepare next task');
    await expect(work.page.getByTestId('assistant-message')).toContainText('Completed by', {
      timeout: 30_000,
    });
  } finally {
    await work.close();
  }
});

test('backend owns conversation history and drains queued work across renderer reload', async ({ workspace }) => {
  const work = await workspace();
  try {
    await start(work.page, 'Slow work: backend owned conversation');
    await work.page.getByLabel('Describe your work').fill('Follow up from the backend queue');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await work.page.reload();
    await work.page.getByRole('button', { name: 'Slow work: backend owned conversation', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toHaveCount(2, { timeout: 60_000 });
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const local = JSON.parse(await readFile(join(work.directory, 'state.json'), 'utf8'));
    expect(local.activities.every((item: any) => !item.messages && !item.queue && !item.plans)).toBe(true);
    const header = await readFile(join(work.directory, 'agent-state', 'activities.sqlite'));
    expect(header.subarray(0, 16).toString()).toBe('SQLite format 3\0');
  } finally { await work.close(); }
});
