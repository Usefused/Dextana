import { expect } from '@playwright/test';
import { test, reply } from './fixture';

test('demonstrate, review, replay, correct, and rerun with different inputs', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let holdFirstRun = true;
  const work = await workspace((body, response) => {
    const prompt =
      body.messages.filter((message: any) => message.role === 'user').at(-1)?.content ?? '';
    if (!prompt.includes('Run the personal skill')) return false;
    if (holdFirstRun) {
      response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      response.write('\n');
    } else reply(body, response, 'The customer is visible in the native desktop app.');
    return true;
  });
  try {
    const page = work.page;
    await expect(page.getByRole('button', { name: 'Teach Dex', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Skills', exact: true }).click();
    await page.getByRole('button', { name: 'Teach Dex', exact: true }).click();
    await page
      .getByLabel('What should this skill accomplish?')
      .fill('Copy customer from the browser into Dext Computer Trial');
    await page.getByRole('button', { name: 'Start recording' }).click();
    const controls = page.getByRole('complementary', { name: 'Teaching controls' });
    await expect(controls).toContainText('captured steps');
    await controls.getByRole('button', { name: 'Pause' }).click();
    await expect(controls).toContainText('Teaching paused');
    await controls.getByRole('button', { name: 'Resume' }).click();
    await controls.getByRole('button', { name: 'Add explanation' }).click();
    await controls
      .getByLabel('Explanation')
      .fill('Use the selected customer and confirm the saved row.');
    await controls.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Sensitive values redacted')).toBeVisible();
    await expect(page.getByText('Dext Computer Trial · Add customer')).toBeVisible();
    await controls.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByRole('heading', { name: 'Review the skill' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel('Required apps')).toHaveValue('Browser, Dext Computer Trial');
    const nativeStep = page.locator('.teach-review-step').last();
    await expect(nativeStep).toContainText('Computer interaction');
    await expect(nativeStep.getByRole('textbox')).toHaveValue(/Bring Dext Computer Trial forward/);
    await page.getByRole('button', { name: 'Add input' }).click();
    await page.getByLabel('Input name').fill('Customer name');
    await page.getByLabel('Input description').fill('Customer to copy');
    await page.getByRole('button', { name: 'Try this skill' }).click();
    await page.getByRole('textbox', { name: 'Customer name' }).fill('Acme');
    await page.getByRole('button', { name: 'Start supervised run' }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.dextana.snapshot()).activities.length))
      .toBeGreaterThan(0);
    const firstActivityId = await page.evaluate(
      async () => (await window.dextana.snapshot()).activities.at(-1)!.id,
    );
    const supervision = page.getByRole('complementary', { name: 'Supervised skill controls' });
    await expect(supervision).toBeVisible();
    await supervision.getByRole('button', { name: 'Add correction' }).click();
    await supervision
      .getByLabel('Correction')
      .fill('Choose the active customer row, even if rows moved.');
    await supervision.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Proposed corrections' })).toBeVisible();
    await supervision.getByRole('button', { name: 'Stop' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          async (id) =>
            (await window.dextana.snapshot()).activities.find((activity) => activity.id === id)
              ?.status,
          firstActivityId,
        ),
      )
      .toBe('cancelled');
    holdFirstRun = false;
    await page.getByRole('button', { name: 'Try this skill' }).click();
    await page.getByRole('textbox', { name: 'Customer name' }).fill('Globex');
    await page.getByRole('button', { name: 'Start supervised run' }).click();
    await expect(page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Taught skills' })).toContainText(
      'Tested successfully',
    );
    await expect(page.getByRole('region', { name: 'Taught skills' })).toContainText('Version 2');
  } finally {
    await work.close();
  }
});
