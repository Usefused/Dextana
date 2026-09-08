import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('Harnest delegates parallel work to isolated child activities using selected models', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const work = await workspace((body, res) => {
    const input = body.messages.filter((m: any) => m.role === 'user').at(-1)?.content;
    if (input !== 'Prepare a launch using two workers') return false;
    if (!body.messages.some((m: any) => m.role === 'tool'))
      reply(body, res, '', [
        {
          function: {
            name: 'delegate',
            arguments: {
              tasks: [
                { prompt: 'Slow work: research launch', model: 'qwen3:8b' },
                { prompt: 'Draft launch checklist', model: 'llama3.2:3b' },
              ],
            },
          },
        },
      ]);
    else reply(body, res, 'Both workers finished. The launch plan is ready.');
    return true;
  });
  try {
    await start(work.page, 'Prepare a launch using two workers');
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'Both workers finished',
      { timeout: 60_000 },
    );
    await work.page
      .getByRole('button', { name: 'Slow work: research launch', exact: true })
      .click();
    await expect(work.page.getByTestId('assistant-message')).toContainText('Completed by qwen3:8b');
    await expect(work.page.getByText('Delegated activity')).toBeVisible();
    await work.page.getByRole('button', { name: 'Draft launch checklist', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'Completed by llama3.2:3b',
    );
    const childCalls = work.calls.filter((c) =>
      c.messages.some(
        (m: any) =>
          typeof m.content === 'string' &&
          (m.content.includes('Slow work: research launch') ||
            m.content.includes('Draft launch checklist')),
      ),
    );
    expect(new Set(childCalls.map((c) => c.model))).toEqual(new Set(['qwen3:8b', 'llama3.2:3b']));
  } finally {
    await work.close();
  }
});
