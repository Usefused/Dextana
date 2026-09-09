import { expect } from '@playwright/test';
import { test, reply, start } from './fixture';

test('computer discovery routes status through the registered desktop tool', async ({
  workspace,
}) => {
  let catalog = '';
  let receipt = '';
  const work = await workspace((body, response) => {
    const user = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(user + 1).filter((message: any) => message.role === 'tool');
    if (!results.length) {
      reply(body, response, '', [
        { function: { name: 'desktop', arguments: { action: 'discover', work: 'computer' } } },
      ]);
    } else if (results.length === 1) {
      catalog = String(results[0].content);
      reply(body, response, '', [
        {
          function: {
            name: 'desktop',
            arguments: {
              action: 'call',
              work: 'computer',
              operation: 'computer.status',
              arguments_json: '{}',
            },
          },
        },
      ]);
    } else {
      receipt = String(results.at(-1).content);
      reply(body, response, 'Computer use is disabled. Enable it in Settings → Computer use.');
    }
    return true;
  });
  try {
    await start(work.page, 'Check computer use status.');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    expect(catalog).toContain('not standalone tools');
    expect(catalog).toContain('arguments_json');
    expect(catalog).toContain('computer.status');
    expect(receipt).toMatch(/"enabled"\s*:\s*false/);
    expect(receipt).not.toContain('not found');
    await expect(work.page.getByRole('region', { name: 'Action approval' })).toHaveCount(0);
  } finally {
    await work.close();
  }
});

test('computer trial uses shared controls, starts disabled and stays responsive', async ({
  workspace,
}, testInfo) => {
  const work = await workspace();
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('button', { name: 'Computer use', exact: true }).click();
    const panel = work.page.getByRole('region', { name: 'Computer use', exact: true });
    await expect(panel.getByText('Experimental', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Request computer permissions' })).toHaveClass(
      /dx-button/,
    );
    await expect(panel.getByLabel('Computer use window')).toHaveCount(0);
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 760));
    const layout = work.page.locator('.settings-panel');
    expect(await layout.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await work.page.screenshot({ path: testInfo.outputPath('computer-trial-narrow.png') });
    await panel.getByRole('button', { name: 'Check permissions', exact: true }).click();
    await expect(panel.getByText(/Accessibility:/)).toBeVisible();
    await expect(panel.locator('pre')).toHaveCount(0);
  } finally {
    await work.close();
  }
});
