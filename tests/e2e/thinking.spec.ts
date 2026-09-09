import { expect } from '@playwright/test';
import { test, start, allowBrowser } from './fixture';
import { createServer } from 'node:http';

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
    await work.page.getByRole('button', { name: 'New activity', exact: true }).click();
    const selector = work.page.getByRole('button', { name: 'Model and reasoning', exact: true });
    await expect(selector).toHaveAttribute('aria-expanded', 'false');
    await expect(work.page.getByRole('group', { name: 'Model and reasoning' })).toHaveCount(0);
    await selector.click();
    await expect(work.page.getByRole('group', { name: 'Model and reasoning' })).toBeVisible();
    await expect(work.page.getByLabel('Reasoning', { exact: true })).toBeEnabled();
    const slider = work.page.getByLabel('Reasoning', { exact: true });
    const bounds = (await slider.boundingBox())!;
    await work.page.mouse.move(bounds.x + bounds.width - 5, bounds.y + bounds.height / 2);
    await work.page.mouse.down();
    await work.page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2, { steps: 8 });
    await work.page.mouse.up();
    await expect(work.page.getByLabel('Reasoning', { exact: true })).toHaveAttribute('aria-valuetext', 'Off');
    await work.page.getByRole('button', { name: 'Reset reasoning', exact: true }).click();
    await expect(work.page.getByLabel('Reasoning', { exact: true })).toHaveAttribute('aria-valuetext', 'On');
    await work.page.getByLabel('Reasoning', { exact: true }).fill('1');
    await work.page.getByRole('group', { name: 'Model and reasoning' }).screenshot({ path: '/private/tmp/dext-reasoning-control.png' });
    await work.page.getByLabel('Describe your work').fill('Open the report and think about it');
    await expect(selector).toHaveAttribute('aria-expanded', 'false');
    await selector.click();
    await work.page.getByLabel('Reasoning', { exact: true }).focus();
    await work.page.keyboard.press('Escape');
    await expect(selector).toBeFocused();
    await expect(selector).toContainText('On');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await allowBrowser(work.page);
    expect(work.calls.at(-1).think).toBe(true);
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
    await selector.click();
    await work.page.getByRole('combobox', { name: 'Activity model', exact: true }).fill('llama3.2:3b');
    await work.page.getByRole('combobox', { name: 'Activity model', exact: true }).press('Enter');
    await expect(work.page.getByLabel('Reasoning', { exact: true })).toBeEnabled();
    await work.page.getByLabel('Reasoning', { exact: true }).fill('0');
    await work.page.keyboard.press('Escape');
    await expect.poll(async () => {
      const state = await work.page.evaluate(() => window.dextana.snapshot());
      return state.activities.find(item => item.title === 'Open the report and think about it')?.modelSelection;
    }).toEqual({ model: 'llama3.2:3b', reasoning: 'off' });
    await work.restart();
    await work.page.getByRole('button', { name: 'Open the report and think about it', exact: true }).click();
    await expect(work.page.getByRole('button', { name: 'Model and reasoning', exact: true })).toContainText('Llama3.2:3bOff');
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
