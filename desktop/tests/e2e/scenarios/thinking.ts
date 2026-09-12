import { expect } from '@playwright/test';
import { start, allowBrowser } from '../fixture';
import { createServer } from 'node:http';

import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* thoughts(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
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
    await expect(thought.locator('.thought-step')).toHaveText([
      'Checking the inputs.',
      'Comparing the two approaches.',
    ]);
    const label = (await toggle.innerText()).match(/Thought for \d+s/)![0];
    yield;
    const page = work.page;
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
}
