import { expect } from '@playwright/test';
import { start } from '../fixture';
import { updateBackendState } from '../backend-state';

import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* conversation(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
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
    const beforeRestart = (await work.page.evaluate(() => window.dextana.snapshot())).activities
      .find(activity => activity.title === 'Slow work: prepare a report')!;
    expect(beforeRestart.runtimeSessionId).toBeTruthy();
    yield async () => {
      // Model the saved ID from an older MemoryStore installation while the
      // desktop is closed. The other conversation remains genuinely durable.
      updateBackendState(work.directory, state => {
        state.activities.find((activity: any) => activity.title === 'Fast work: prepare a checklist')
          .runtimeSessionId = 'legacy-memory-session';
      });
    };
    const page = work.page;
    await page.getByRole('button', { name: 'Slow work: prepare a report', exact: true }).click();
    await expect(page.getByTestId('assistant-message').first()).toContainText(
      'Completed by qwen3:8b',
    );
    const previousReplies = await page.getByTestId('assistant-message').count();
    await page.getByLabel('Describe your work').fill('Follow up after restarting');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByTestId('assistant-message')).toHaveCount(previousReplies + 1, { timeout: 30_000 });
    await expect(page.getByTestId('assistant-message').last()).toContainText('Follow-up with', { timeout: 30_000 });
    await expect(page.getByTestId('activity-status')).toHaveText('Completed');
    const restored = (await page.evaluate(() => window.dextana.snapshot())).activities
      .find(activity => activity.id === beforeRestart.id)!;
    expect(restored.runtimeSessionId).toBe(beforeRestart.runtimeSessionId);
    const restoredCall = work.calls.find(call => call.messages.some((message: any) =>
      message.role === 'user' && message.content === 'Follow up after restarting'));
    expect(restoredCall).toBeTruthy();
    expect(restoredCall.messages.some((message: any) =>
      message.role === 'user' && message.content === 'Slow work: prepare a report')).toBe(true);
    expect(JSON.stringify(restoredCall.messages)).not.toContain('The execution session restarted.');
    await page.getByRole('button', { name: 'Fast work: prepare a checklist', exact: true }).click();
    const legacyReplies = await page.getByTestId('assistant-message').count();
    await page.getByLabel('Describe your work').fill('Follow up migrating the older chat');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByTestId('assistant-message')).toHaveCount(legacyReplies + 1, { timeout: 30_000 });
    await expect(page.getByTestId('assistant-message').last()).toContainText('Follow-up with', { timeout: 30_000 });
    await expect(page.getByTestId('activity-status')).toHaveText('Completed');
    const migrated = (await page.evaluate(() => window.dextana.snapshot())).activities
      .find(activity => activity.title === 'Fast work: prepare a checklist')!;
    expect(migrated.runtimeSessionId).toBeTruthy();
    expect(migrated.runtimeSessionId).not.toBe('legacy-memory-session');
    const migratedCall = work.calls.find(call => call.messages.some((message: any) =>
      message.content?.includes('Follow up migrating the older chat')));
    expect(JSON.stringify(migratedCall.messages)).toContain('Fast work: prepare a checklist');
    expect(JSON.stringify(migratedCall.messages)).toContain('The execution session restarted.');
  } finally {
    await work.close();
  }
}
