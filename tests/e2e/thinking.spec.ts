import { expect } from '@playwright/test';
import { test, start, allowBrowser } from './fixture';
import { createServer } from 'node:http';

test('thoughts stream live, collapse at the answer, and expand with their duration after restart', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let advance: () => void = () => {};
  let finish: () => void = () => {};
  const work = await workspace((body, response) => {
    const prompt = body.messages.filter((m: any) => m.role === 'user').at(-1)?.content;
    if (prompt !== 'Think through this work') return false;
    response.setHeader('Content-Type', 'application/x-ndjson');
    const chunk = (thinking: string) =>
      response.write(
        JSON.stringify({
          model: body.model,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: '', thinking },
          done: false,
        }) + '\n',
      );
    advance = () => chunk('\n\nComparing the two approaches.');
    finish = () => {
      if (response.writableEnded || response.destroyed) return;
      response.write(
        JSON.stringify({
          model: body.model,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: 'Here is the finished output.' },
          done: false,
        }) + '\n',
      );
      response.end(
        JSON.stringify({
          model: body.model,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 10,
          eval_count: 5,
        }) + '\n',
      );
    };
    chunk('Checking the inputs.');
    return true;
  });
  try {
    await start(work.page, 'Think through this work');
    const thought = work.page.getByTestId('thought-content');
    await expect(thought).toHaveText('Checking the inputs.', { timeout: 60_000 });
    await expect(work.page.getByRole('button', { name: /Thinking/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    advance();
    await expect(thought).toContainText('Comparing the two approaches.');
    finish();
    await expect(work.page.getByTestId('assistant-message')).toHaveText(
      'Here is the finished output.',
    );
    const toggle = work.page.getByRole('button', { name: /Thought for \d+s/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(thought).not.toBeVisible();
    await toggle.click();
    await expect(thought).toHaveText('Checking the inputs. Comparing the two approaches.');
    await expect(thought).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(thought.locator('.thought-step')).toHaveText(['Checking the inputs.', 'Comparing the two approaches.']);
    const label = (await toggle.innerText()).match(/Thought for \d+s/)![0];
    const page = await work.restart();
    await page.getByRole('button', { name: 'Think through this work', exact: true }).click();
    const restored = page.getByRole('button', { name: /Thought for \d+s/ });
    await expect(restored).toContainText(label);
    await expect(restored).toHaveAttribute('aria-expanded', 'false');
    await restored.click();
    await expect(page.getByTestId('thought-content')).toContainText(
      'Comparing the two approaches.',
    );
    await start(page, 'A normal answer without thoughts');
    await expect(page.getByTestId('assistant-message')).toContainText('Completed by', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('thought-content')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Thought for/ })).toHaveCount(0);
  } finally {
    finish();
    await work.close();
  }
});

test('thinking streams after an embedded browser action and freezes when stopped', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let reportRequested = false;
  let openReport = () => {};
  const site = createServer((_req, res) => {
    reportRequested = true;
    openReport = () => res.end('<h1>Work report</h1>');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    if (!body.messages.some((message: any) => message.role === 'tool')) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      const common = { model: body.model, created_at: new Date().toISOString() };
      res.write(
        JSON.stringify({
          ...common,
          message: { role: 'assistant', content: '', thinking: 'Opening the report first.\n\n' },
          done: false,
        }) + '\n',
      );
      res.write(
        JSON.stringify({
          ...common,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'browser',
                  arguments: { action: 'open', url, ref: '', text: '' },
                },
              },
            ],
          },
          done: false,
        }) + '\n',
      );
      res.end(
        JSON.stringify({
          ...common,
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
        }) + '\n',
      );
    } else {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.write(
        JSON.stringify({
          model: body.model,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: '', thinking: 'Reviewing the opened report.' },
          done: false,
        }) + '\n',
      );
    }
    return true;
  });
  try {
    await start(work.page, 'Open the report and think about it');
    await allowBrowser(work.page);
    await expect.poll(() => reportRequested, { timeout: 60_000 }).toBe(true);
    await expect(work.page.getByTestId('thought-content')).toHaveText('Opening the report first.');
    await expect(work.page.getByRole('button', { name: /Thinking/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    openReport();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(url, {
      timeout: 60_000,
    });
    await expect(work.page.getByTestId('thought-content')).toHaveText(
      'Opening the report first. Reviewing the opened report.',
      { timeout: 30_000 },
    );
    await expect(work.page.getByTestId('thought-content').locator('.thought-step')).toHaveText(['Opening the report first.', 'Reviewing the opened report.']);
    await work.page.getByRole('button', { name: 'Stop activity', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    const toggle = work.page.getByRole('button', { name: /Thought for/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(work.page.getByTestId('thought-content')).toHaveText(
      'Opening the report first. Reviewing the opened report.',
    );
  } finally {
    openReport();
    await work.close();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
