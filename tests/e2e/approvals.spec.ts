import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply } from './fixture';

test('browser permission blocks contact, supports allow once and denial, and persists chat-only auto-allow', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  let visits = 0;
  const site = createServer((_req, res) => {
    visits++;
    res.end('<h1>Permission test</h1>');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(user + 1).filter((message: any) => message.role === 'tool');
    if (results.length < 2)
      reply(body, res, '', [
        {
          function: {
            name: 'browser',
            arguments: {
              action: results.length ? 'read' : 'open',
              url: results.length ? '' : url,
              ref: '',
              text: '',
            },
          },
        },
      ]);
    else reply(body, res, 'Browser checks complete.');
    return true;
  });
  try {
    await start(work.page, 'Ask before using the browser');
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate()).toContainText(url, { timeout: 60_000 });
    expect(visits).toBe(0);
    await expect(work.page.getByText('Chat permissions', { exact: true })).toHaveCount(0);
    await expect(work.page.locator('.message.assistant').last().getByRole('region', { name: 'Action approval' })).toBeVisible();
    await expect(work.page.getByRole('region', { name: 'Automatic access' })).toHaveCount(0);
    await expect(work.page.getByLabel('Activity browser address')).toHaveCount(0);
    await work.page.screenshot({ path: testInfo.outputPath('browser-permission.png') });
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(gate()).toContainText('Browser · read');
    expect(visits).toBeGreaterThan(0);
    await gate().getByRole('button', { name: 'Deny action' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await expect(gate()).toHaveCount(0);

    await start(work.page, 'Automatically allow this browser chat');
    await expect(gate()).toBeVisible();
    await gate().getByLabel('Auto-allow browser actions in this chat').check();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toHaveText('Browser checks complete.');
    await expect(gate()).toHaveCount(0);
    const page = await work.restart();
    await page
      .getByRole('button', { name: 'Automatically allow this browser chat', exact: true })
      .click();
    await expect(page.getByText('Chat permissions', { exact: true })).toHaveCount(0);
    const automatic = page.getByRole('region', { name: 'Automatic access' });
    await expect(automatic).toContainText('Browser actions');
    await expect(automatic).not.toContainText('MCP actions');
    await page.getByLabel('Describe your work').fill('Run the checks again');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByTestId('assistant-message')).toHaveCount(2);
    await expect(page.getByTestId('assistant-message').last()).toHaveText(
      'Browser checks complete.',
    );
    await automatic.getByRole('button', { name: 'Ask before browser actions', exact: true }).click();
    await expect(automatic).toHaveCount(0);
    await page.getByLabel('Describe your work').fill('Ask again for the next check');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate()).toBeVisible();
    await start(page, 'A separate chat requires its own permission');
    await expect(gate()).toBeVisible();
    await page.getByRole('button', { name: 'Stop activity' }).click();
    await expect(gate()).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Automatically allow this browser chat', exact: true })
      .click();
    await expect(gate()).toBeVisible();
    await gate().getByRole('button', { name: 'Deny action' }).click();
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
