import { expect } from '@playwright/test';
import { test } from './fixture';

test('scheduled jobs can be created, edited, run, paused and removed', async ({ workspace }) => {
  test.setTimeout(120_000);
  const work = await workspace();
  try {
    const page = work.page;
    await page.getByLabel('Workspace view').selectOption('cron');
    await page.getByRole('button', { name: 'New job', exact: true }).click();
    await page.getByLabel('Job name').fill('Daily notes');
    await page.getByLabel('Job instructions').fill('Prepare my scheduled notes');
    await page.getByRole('button', { name: 'Save job' }).click();
    const job = page.getByRole('article', { name: 'Daily notes', exact: true });
    await expect(job).toContainText('Next run');
    await job.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(job).toContainText('Paused');
    await job.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Cron expression').fill('30 10 * * 1-5');
    await page.getByRole('button', { name: 'Save job' }).click();
    await expect(job).toContainText('30 10 * * 1-5');
    await job.getByRole('button', { name: 'Run now', exact: true }).click();
    await expect(job.getByRole('button', { name: /completed/i })).toBeVisible({ timeout: 60_000 });
    await job.getByRole('button', { name: /completed/i }).click();
    await expect(page.getByTestId('assistant-message')).toContainText('Completed by');
    const restored = await work.restart();
    await restored.getByLabel('Workspace view').selectOption('cron');
    const saved = restored.getByRole('article', { name: 'Daily notes', exact: true });
    await expect(saved).toContainText('Paused');
    await saved.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(saved).toContainText('Next run');
    await saved.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(saved).toHaveCount(0);
  } finally { await work.close(); }
});

test('backend automatically dispatches a due job without opening its activity', async ({ workspace }) => {
  test.setTimeout(150_000);
  const work = await workspace();
  try {
    const page = work.page;
    await page.getByLabel('Workspace view').selectOption('cron');
    await page.getByRole('button', { name: 'New job', exact: true }).click();
    await page.getByLabel('Job name').fill('Automatic check');
    await page.getByLabel('Job instructions').fill('Run my automatic scheduled check');
    await page.getByLabel('Cron expression').fill('* * * * *');
    await page.getByRole('button', { name: 'Save job' }).click();
    const job = page.getByRole('article', { name: 'Automatic check', exact: true });
    await expect(job.getByRole('button', { name: /completed/i })).toBeVisible({ timeout: 100_000 });
    await expect(page.getByRole('heading', { name: 'Scheduled jobs', exact: true })).toBeVisible();
    await job.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.screenshot({ path: '/private/tmp/dextana-cron-view.png' });
    await job.getByRole('button', { name: 'Delete', exact: true }).click();
  } finally { await work.close(); }
});
