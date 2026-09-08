import { expect } from '@playwright/test';
import { test, start } from './fixture';

test('real Harnest runs concurrent models, keeps follow-up context, and persists the transcript', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const work = await workspace();
  try {
    await start(work.page, 'Slow work: prepare a report', 'qwen3:8b');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Running', {
      timeout: 60_000,
    });
    await start(work.page, 'Fast work: prepare a checklist', 'llama3.2:3b');
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'Completed by llama3.2:3b',
      { timeout: 60_000 },
    );
    await work.page
      .getByRole('button', { name: 'Slow work: prepare a report', exact: true })
      .click();
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'Completed by qwen3:8b',
      { timeout: 30_000 },
    );
    await work.page.getByLabel('Describe your work').fill('Follow up with next steps');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Follow-up with',
      { timeout: 30_000 },
    );
    const followUp = work.calls.find((c) =>
      c.messages.some((m: any) => m.content === 'Follow up with next steps'),
    );
    expect(JSON.stringify(followUp.messages)).toContain('Slow work: prepare a report');
    const page = await work.restart();
    await page.getByRole('button', { name: 'Slow work: prepare a report', exact: true }).click();
    await expect(page.getByTestId('assistant-message').first()).toContainText(
      'Completed by qwen3:8b',
    );
  } finally {
    await work.close();
  }
});

test('cancelling one activity leaves another activity usable', async ({ workspace }) => {
  test.setTimeout(120_000);
  const work = await workspace();
  try {
    await start(work.page, 'Wait until cancelled');
    await expect.poll(() => work.calls.length, { timeout: 60_000 }).toBeGreaterThan(0);
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
