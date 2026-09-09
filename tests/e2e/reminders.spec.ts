import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';
import { createServer } from 'node:http';

test('the agent saves a timed reminder, shows its time in Scheduled jobs, and delivers it once after restart', async ({ workspace }) => {
  test.setTimeout(120_000);
  let receipt = '';
  let available = false;
  let clockAvailable = false;
  const work = await workspace((body, res) => {
    available ||= body.tools?.some((tool: any) => tool.function?.name === 'schedule');
    clockAvailable ||= body.messages.some((message: any) => message.role === 'system' && String(message.content).includes('Current local time:'));
    const user = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(user + 1).filter((message: any) => message.role === 'tool');
    if (!results.length) reply(body, res, '', [{ function: { name: 'schedule', arguments: {
      action: 'create', name: 'Zoho email reminder', prompt: 'How to check my email in Zoho',
      kind: 'reminder', delay_seconds: 25,
    } } }]);
    else {
      receipt = String(results.at(-1).content);
      reply(body, res, 'Saved your reminder. ' + receipt);
    }
    return true;
  });
  try {
    await start(work.page, 'Remind me about my Zoho email in 25 seconds');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    expect(available).toBe(true);
    expect(clockAvailable).toBe(true);
    expect(receipt).toContain('nextRunAt');
    expect(receipt).toContain('scheduled');
    await work.page.getByLabel('Workspace view').selectOption('cron');
    let job = work.page.getByRole('article', { name: 'Zoho email reminder', exact: true });
    await expect(job).toContainText('Once');
    await expect(job).toContainText('Next run');
    await work.restart();
    await work.page.getByLabel('Workspace view').selectOption('cron');
    job = work.page.getByRole('article', { name: 'Zoho email reminder', exact: true });
    await expect(job.getByRole('button', { name: /completed/i })).toBeVisible({ timeout: 60_000 });
    await expect(job).not.toContainText('Next run');
    await job.getByRole('button', { name: /completed/i }).click();
    await expect(work.page.getByTestId('assistant-message').filter({ hasText: /^Reminder: How to check my email in Zoho$/ })).toHaveCount(1);
    await work.restart();
    await work.page.getByRole('button', { name: 'Remind me about my Zoho email in 25 seconds', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').filter({ hasText: /^Reminder: How to check my email in Zoho$/ })).toHaveCount(1);
    await work.page.getByLabel('Workspace view').selectOption('cron');
    await work.page.getByRole('article', { name: 'Zoho email reminder', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click();
  } finally { await work.close(); }
});

test('plan drafting cannot schedule work; approval creates a real job whose future actions still need consent', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => res.end('<title>Scheduled work</title>'));
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  let blocked = false;
  const args = { action: 'create', name: 'Scheduled browser check', kind: 'task', prompt: 'Perform the scheduled browser action', delay_seconds: 8 };
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((message: any) => message.role === 'user');
    const prompt = body.messages[user].content;
    const results = body.messages.slice(user + 1).filter((message: any) => message.role === 'tool');
    const call = (name: string, arguments_: object) => reply(body, res, '', [{ function: { name, arguments: arguments_ } }]);
    if (prompt.includes('[DEXTANA_PLAN_DRAFT]')) {
      if (!results.length) call('schedule', args);
      else if (results.length === 1) {
        blocked = String(results[0].content).includes('Plan mode');
        call('propose_plan', { title: 'Schedule a browser check', steps: ['Save a browser check to run in eight seconds.'], browser_urls: [url], file_reads: [], file_creates: [], mcp_tools: [], fused_integrations: [] });
      } else reply(body, res, 'The plan is ready. It has not been scheduled.');
    } else if (prompt.includes('[DEXTANA_APPROVED_PLAN]')) {
      if (!results.length) call('schedule', args);
      else reply(body, res, 'The browser check is scheduled. ' + results.at(-1).content);
    } else if (!results.length) call('browser', { action: 'open', url });
    else reply(body, res, 'Finished.');
    return true;
  });
  try {
    await work.page.getByRole('button', { name: 'New activity', exact: true }).click();
    await work.page.getByLabel('Activity mode', { exact: true }).selectOption('plan');
    await work.page.getByLabel('Describe your work').fill('Plan a future browser check');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    const plan = work.page.getByRole('region', { name: 'Work plan' }).last();
    await expect(plan.getByRole('button', { name: 'Approve plan and start' })).toBeEnabled({ timeout: 60_000 });
    expect(blocked).toBe(true);
    await plan.getByRole('button', { name: 'Approve plan and start' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await work.page.getByLabel('Workspace view').selectOption('cron');
    const job = work.page.getByRole('article', { name: 'Scheduled browser check', exact: true });
    await expect(job.getByRole('button', { name: /Needs approval/i })).toBeVisible({ timeout: 60_000 });
    await job.getByRole('button', { name: /Needs approval/i }).click();
    const approval = work.page.getByRole('region', { name: 'Action approval' });
    await expect(approval).toBeVisible();
    await approval.getByRole('button', { name: 'Deny action', exact: true }).click();
    await work.page.getByLabel('Workspace view').selectOption('cron');
    await job.getByRole('button', { name: 'Delete', exact: true }).click();
  } finally { await work.close(); await new Promise<void>(resolve => site.close(() => resolve())); }
});
