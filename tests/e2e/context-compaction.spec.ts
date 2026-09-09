import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('a million-token model retains history beyond the former byte ceiling', async ({
  workspace,
}) => {
  test.setTimeout(90_000);
  const historical = 'Project evidence and completed action receipts. '.repeat(8000);
  const work = await workspace((body, res) => {
    expect(
      body.messages.some(
        (message: any) =>
          message.role === 'system' &&
          message.content?.includes('You compact conversation records'),
      ),
    ).toBe(false);
    const input = body.messages.findLast((message: any) => message.role === 'user')?.content ?? '';
    if (input.includes('Retain a large project history')) reply(body, res, historical);
    else {
      expect(
        body.messages.some(
          (message: any) => message.role === 'assistant' && message.content === historical,
        ),
      ).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(body.messages))).toBeGreaterThan(192_000);
      reply(body, res, 'Long context retained without compression.');
    }
    return true;
  });
  try {
    work.setContextWindow(1_000_000);
    await work.restart();
    await start(work.page, 'Retain a large project history');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    await work.page.getByLabel('Describe your work').fill('Continue using the complete history.');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
      'Long context retained without compression.',
      { timeout: 30_000 },
    );
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    const activity = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).activities[0],
    );
    expect(activity.events.some((event) => /compact|shorten/i.test(event))).toBe(false);
  } finally {
    work.setContextWindow(32768);
    await work.restart();
    await work.close();
  }
});

test('Harnest compacts long history with a tool-free worker and reuses saved memory after restart', async ({
  workspace,
}) => {
  test.setTimeout(90_000);
  const detail = 'Report 42 is saved. Publishing is forbidden. Review remains.';
  const longAnswer = detail + '\n' + 'Historical result with repetitive details. '.repeat(4300);
  let summaries = 0;
  const work = await workspace((body, res) => {
    const isCompactor = body.messages.some(
      (m: any) => m.role === 'system' && m.content.includes('You compact conversation records'),
    );
    if (isCompactor) {
      summaries++;
      expect(body.tools ?? []).toHaveLength(0);
      expect(body.think).toBe(false);
      expect(body.model).toBe('qwen3:8b');
      expect(JSON.stringify(body.messages)).not.toContain('PRIVATE_REASONING');
      reply(body, res, detail);
      return true;
    }
    const input = body.messages.filter((m: any) => m.role === 'user').at(-1)?.content ?? '';
    if (input.includes('Create a long history for compaction')) {
      const common = { model: body.model, created_at: new Date().toISOString() };
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.write(
        JSON.stringify({
          ...common,
          message: { role: 'assistant', content: '', thinking: 'PRIVATE_REASONING' },
          done: false,
        }) + '\n',
      );
      res.write(
        JSON.stringify({
          ...common,
          message: { role: 'assistant', content: longAnswer },
          done: false,
        }) + '\n',
      );
      res.end(
        JSON.stringify({ ...common, message: { role: 'assistant', content: '' }, done: true }) +
          '\n',
      );
      return true;
    }
    if (input.includes('Review report 42') || input.includes('Explain the remaining review')) {
      expect(Buffer.byteLength(JSON.stringify(body.messages))).toBeLessThan(192_000);
      expect(JSON.stringify(body.messages)).toContain(detail);
      expect(JSON.stringify(body.messages)).not.toContain(
        'Historical result with repetitive details.',
      );
      expect(JSON.stringify(body.messages)).not.toContain('PRIVATE_REASONING');
      reply(body, res, 'Report 42 is ready for review; publishing remains forbidden.');
      return true;
    }
    return false;
  });
  try {
    await start(work.page, 'Create a long history for compaction');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    await work.page.getByLabel('Describe your work').fill('Review report 42 without publishing.');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'publishing remains forbidden',
      { timeout: 30_000 },
    );
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    const activity = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).activities[0],
    );
    expect(activity.events, 'Compaction should complete, without the excerpt fallback').toContain(
      'Context compacted: important details retained; thinking history excluded.',
    );
    expect(activity.messages.find((message) => message.role === 'assistant')?.content).toBe(
      longAnswer,
    );
    expect(summaries).toBeGreaterThan(1);
    expect(Buffer.byteLength(longAnswer)).toBeLessThan(192_000);
    const count = summaries;
    await work.restart();
    await work.page
      .getByRole('button', { name: 'Create a long history for compaction', exact: true })
      .click();
    await work.page.getByLabel('Describe your work').fill('Explain the remaining review.');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toHaveCount(3, { timeout: 30_000 });
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    expect(summaries).toBe(count);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'publishing remains forbidden',
    );
    // Cancellation discards the execution session. Recovery must compact the
    // full saved transcript instead of embedding it inside the new user input.
    await work.page.getByLabel('Describe your work').fill('Wait until cancelled');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Running');
    await work.page.evaluate((id) => window.dextana.cancel(id), activity.id);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await work.page
      .getByLabel('Describe your work')
      .fill('Explain the remaining review after interruption.');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'publishing remains forbidden',
    );
    expect(summaries).toBeGreaterThan(count);
  } finally {
    await work.close();
  }
});

test('missing Ollama context metadata does not reject an ordinary chat', async ({ workspace }) => {
  const work = await workspace((body, res) => {
    expect(
      body.messages.some(
        (m: any) => m.role === 'system' && m.content?.includes('You compact conversation records'),
      ),
    ).toBe(false);
    reply(body, res, 'Short request completed without a guessed context limit.');
    return true;
  });
  try {
    work.setContextWindow(undefined);
    // Clear discovery from the previous test while retaining the same endpoint.
    await work.restart();
    await start(work.page, 'Check a short request without context metadata');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 30_000,
    });
    await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
      'Short request completed without a guessed context limit.',
    );
    const activity = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).activities[0],
    );
    expect(activity.error).toBeUndefined();
    expect(activity.events.some((event) => /compact|shorten/i.test(event))).toBe(false);
  } finally {
    work.setContextWindow(32768);
    await work.close();
  }
});
