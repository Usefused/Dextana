import { expect } from '@playwright/test';
import { start } from '../fixture';

import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* archives(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
  const work = await workspace();
  try {
    await start(work.page, 'Prepare a report to archive');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await work.page.getByRole('button', { name: 'New activity', exact: true }).click();
    await work.page.getByLabel('Describe your work').fill('Keep this unsent draft');
    await work.page
      .getByRole('button', { name: 'Prepare a report to archive', exact: true })
      .hover();
    await work.page
      .getByRole('button', { name: 'Archive Prepare a report to archive', exact: true })
      .click();
    await expect(
      work.page.getByRole('button', { name: 'Prepare a report to archive', exact: true }),
    ).toHaveCount(0);
    await expect(work.page.getByLabel('Describe your work')).toHaveValue('Keep this unsent draft');
    await expect(work.page.getByRole('button', { name: 'Archived', exact: true })).toHaveCount(0);
    await expect(work.page.getByRole('status')).toContainText('Chat archived');
    await work.page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(work.page.getByRole('status')).toContainText('Chat restored');
    await expect(work.page.getByLabel('Describe your work')).toHaveValue('Keep this unsent draft');
    await work.page
      .getByRole('button', { name: 'Prepare a report to archive', exact: true })
      .hover();
    await work.page
      .getByRole('button', { name: 'Archive Prepare a report to archive', exact: true })
      .click();
    await expect(work.page.getByRole('status')).toContainText('Chat archived');
    yield;
    const page = work.page;
    await expect(
      page.getByRole('button', { name: 'Prepare a report to archive', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Archived', exact: true })).toHaveCount(0);
    const archived = await page.evaluate(async () =>
      (await window.dextana.snapshot()).activities.find(
        (activity) => activity.title === 'Prepare a report to archive',
      ),
    );
    expect(archived?.archived).toBe(true);
    expect(archived?.messages.some((message) => message.content.includes('Completed by'))).toBe(
      true,
    );
    await start(page, 'Archive the selected activity');
    await expect(page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Archive the selected activity', exact: true }).hover();
    await page
      .getByRole('button', { name: 'Archive Archive the selected activity', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Archive the selected activity', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'What are we working on?' })).toBeVisible();
  } finally {
    await work.close();
  }
}
