import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('a composer message resolves a live question and visibly resumes the same agent', async ({
  workspace,
}, info) => {
  test.setTimeout(90_000);
  let finish: (() => void) | undefined;
  const work = await workspace((body, response) => {
    if (!body.messages.some((message: any) => message.role === 'tool')) {
      reply(body, response, 'I need the report audience.', [
        {
          function: {
            name: 'ask_questions',
            arguments: {
              title: 'Choose the audience',
              questions: [{ id: 'audience', prompt: 'Who is the report for?', type: 'text' }],
            },
          },
        },
      ]);
    } else finish = () => reply(body, response, 'Preparing the report for Leadership.');
    return true;
  });
  try {
    await start(work.page, 'Ask me a live question about the audience');
    const card = work.page.getByRole('region', { name: 'Choose the audience', exact: true });
    await expect(card.getByRole('button', { name: 'Send reply' })).toBeEnabled({ timeout: 60_000 });
    await expect(work.page.getByRole('status', { name: 'Agent progress' })).toHaveText(
      'Waiting for your answer…',
    );
    await work.page.getByLabel('Describe your work').fill('Leadership');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(() => !!finish, { timeout: 60_000 }).toBe(true);
    await expect(card).toContainText('Answered in your reply below.');
    await expect(card.locator('input, textarea, button')).toHaveCount(0);
    await expect(work.page.getByText('You replied', { exact: true })).toBeVisible();
    await expect(work.page.getByRole('status', { name: 'Agent progress' })).toHaveText('Working…');
    await work.page
      .locator('.activity-view')
      .screenshot({ path: info.outputPath('question-resumed.png') });
    await expect(work.page.getByRole('region', { name: 'Queued messages' })).toHaveCount(0);
    expect(JSON.stringify(work.calls.at(-1).messages)).toContain('Leadership');
    finish!();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Preparing the report for Leadership.',
    );
    await expect(work.page.getByRole('status', { name: 'Agent progress' })).toHaveCount(0);
    await work.restart();
    await work.page
      .getByRole('button', { name: 'Ask me a live question about the audience', exact: true })
      .click();
    await expect(work.page.getByRole('button', { name: 'Send reply', exact: true })).toHaveCount(0);
    await expect(work.page.getByText('You replied', { exact: true })).toBeVisible();
  } finally {
    await work.close();
  }
});
