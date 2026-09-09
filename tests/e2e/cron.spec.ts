import { expect } from '@playwright/test';
import { test } from './fixture';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

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
    const db = new DatabaseSync(join(work.directory, 'schedules.sqlite'), { readOnly: true });
    try {
      const runs = db.prepare("SELECT data FROM harnest_tasks WHERE application_id='dextana' AND status='completed'").all();
      expect(runs.some((row) => {
        const run = JSON.parse(row.data as string);
        return run.trigger === 'cron' && run.task_name === 'harnest.dextana.tasks.scheduled_activity';
      })).toBe(true);
    } finally { db.close(); }
    await expect(page.getByRole('heading', { name: 'Scheduled jobs', exact: true })).toBeVisible();
    await job.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.screenshot({ path: '/private/tmp/dextana-cron-view.png' });
    await job.getByRole('button', { name: 'Delete', exact: true }).click();
  } finally { await work.close(); }
});

test('existing schedules and history migrate to Harnest and remain editable after restart', async ({ workspace }) => {
  test.setTimeout(120_000);
  const work = await workspace();
  const id = 'legacy-schedule-migration';
  try {
    await work.restart(async () => {
      const db = new DatabaseSync(join(work.directory, 'schedules.sqlite'));
      try {
        db.exec('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
        db.prepare('INSERT INTO jobs VALUES (?, ?)').run(id, JSON.stringify({
          id, name: 'Migrated notes', prompt: 'Prepare my migrated notes', model: 'qwen3:8b',
          expression: '0 9 * * 1-5', timezone: 'Europe/London', enabled: false,
          runs: [{ id: 'previous-run', startedAt: '2026-09-08T08:00:00+00:00', status: 'completed' }],
        }));
      } finally { db.close(); }
    });
    let page = work.page;
    await page.getByLabel('Workspace view').selectOption('cron');
    let job = page.getByRole('article', { name: 'Migrated notes', exact: true });
    await expect(job).toContainText('Paused');
    await expect(job).toContainText('Europe/London');
    await expect(job.locator('.cron-history > div')).toHaveText([/completed/i]);
    await job.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Model', { exact: true }).selectOption('qwen3:8b');
    await page.getByLabel('Cron expression').fill('30 10 * * 1-5');
    await page.getByRole('button', { name: 'Save job' }).click();
    await job.getByRole('button', { name: 'Run now', exact: true }).click();
    await expect(job.getByRole('button', { name: /completed/i })).toHaveCount(1, { timeout: 60_000 });
    await expect(job.locator('.cron-history > div')).toHaveText([/completed/i, /completed/i]);
    await work.restart();
    page = work.page;
    await page.getByLabel('Workspace view').selectOption('cron');
    job = page.getByRole('article', { name: 'Migrated notes', exact: true });
    await expect(job).toContainText('30 10 * * 1-5');
    await expect(job).toContainText('Paused');
    await expect(job.getByRole('button', { name: /completed/i })).toHaveCount(1);
    await expect(job.locator('.cron-history > div')).toHaveText([/completed/i, /completed/i]);
    await job.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(job).toContainText('Next run');
    await job.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(job).toHaveCount(0);
  } finally { await work.close(); }
});
