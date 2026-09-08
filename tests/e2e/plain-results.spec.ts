import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('structured model replies appear as readable results during streaming and after restart', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  let finish = () => {};
  const work = await workspace((body, res) => {
    const prompt = body.messages.findLast((m: any) => m.role === 'user').content;
    if (prompt.includes('streamed result')) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.write(
        JSON.stringify({
          model: body.model,
          message: { role: 'assistant', content: 'Here is your report:\n```json\n{"total_cost":' },
          done: false,
        }) + '\n',
      );
      finish = () => {
        res.write(
          JSON.stringify({
            model: body.model,
            message: {
              role: 'assistant',
              content:
                '330,"items":[{"name":"Travel","amount":250},{"name":"Supplies","amount":80}]}\n```',
            },
            done: false,
          }) + '\n',
        );
        res.end(
          JSON.stringify({
            model: body.model,
            message: { role: 'assistant', content: '' },
            done: true,
          }) + '\n',
        );
      };
    } else
      reply(
        body,
        res,
        'Document ready: {"path":"/Documents/Dextana/Budget.xlsx","created":true,"bytes":5800}',
      );
    return true;
  });
  try {
    await start(work.page, 'Show my streamed result');
    const result = () => work.page.getByTestId('assistant-message').last();
    await expect(result()).toContainText('Preparing results', { timeout: 60_000 });
    await expect(result()).not.toContainText('total_cost');
    await expect(result()).not.toContainText('{');
    finish();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect(result()).toContainText('Total cost');
    await expect(result().getByRole('table')).toContainText('Travel');
    await expect(result()).not.toContainText('"amount"');
    await expect(result().locator('code')).toHaveCount(0);
    await work.page.screenshot({ path: testInfo.outputPath('readable-result.png') });
    await work.restart();
    await work.page.getByRole('button', { name: 'Show my streamed result', exact: true }).click();
    await expect(result()).toContainText('Total cost');
    await expect(result()).not.toContainText('{');
    await start(work.page, 'Create my budget');
    // Restart also cold-starts the bundled agent runtime on its next request.
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await expect(result()).toContainText('Budget.xlsx');
    await expect(result()).toContainText('Created');
    await expect(result()).not.toContainText('"path"');
  } finally {
    finish();
    await work.close();
  }
});
