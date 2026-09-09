import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('desktop countdown pauses across restart, resumes, snoozes and dismisses', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  const work = await workspace();
  try {
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    let panel = work.page.getByRole('region', { name: 'Desktop timers and reminders' });
    await panel.getByRole('button', { name: 'New timer', exact: true }).click();
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByLabel('Desktop alarm title')
      .fill('Steep green tea');
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByLabel('Timer minutes')
      .fill('0.15');
    const editor = work.page.getByRole('dialog', { name: 'New timer', exact: true });
    const nameBounds = await editor.getByLabel('Desktop alarm title').boundingBox();
    const durationBounds = await editor.getByLabel('Timer minutes').boundingBox();
    expect(durationBounds!.y).toBeGreaterThan(nameBounds!.y + nameBounds!.height);
    expect(Math.abs(durationBounds!.x - nameBounds!.x)).toBeLessThan(2);
    await work.page.screenshot({ path: testInfo.outputPath('desktop-timer-create-wide.png') });
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 880));
    expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const dialogBounds = await editor.boundingBox();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(16);
    expect(dialogBounds!.width).toBeLessThanOrEqual(500);
    await work.page.screenshot({ path: testInfo.outputPath('desktop-timer-create-narrow.png') });
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1320, 880));
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByRole('button', { name: 'Start timer', exact: true })
      .click();
    let timer = panel.getByRole('article', { name: 'Steep green tea', exact: true });
    await timer.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(timer).toContainText('Paused');
    const paused = await timer.getByLabel('Time remaining').textContent();
    await work.restart();
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    panel = work.page.getByRole('region', { name: 'Desktop timers and reminders' });
    timer = panel.getByRole('article', { name: 'Steep green tea', exact: true });
    await expect(timer).toContainText('Paused');
    await expect(timer.getByLabel('Time remaining')).toHaveText(paused!);
    await timer.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(timer).toContainText('Due now', { timeout: 15_000 });
    await expect(timer).toHaveClass(/dx-card/);
    await expect(timer.getByRole('button', { name: 'Dismiss', exact: true })).toHaveClass(
      /dx-button--primary/,
    );
    await work.page.screenshot({ path: testInfo.outputPath('desktop-timer-due.png') });
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 880));
    await timer.scrollIntoViewIfNeeded();
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await work.page.screenshot({ path: testInfo.outputPath('desktop-timer-narrow.png') });
    await work
      .app()
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1320, 880));
    await timer.getByRole('button', { name: 'Snooze 5 min', exact: true }).click();
    await expect(timer.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await timer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(timer).toHaveCount(0);
    await panel.getByRole('button', { name: 'New timer', exact: true }).click();
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByLabel('Desktop alarm title')
      .fill('Finish tea');
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByLabel('Timer minutes')
      .fill('0.02');
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByRole('button', { name: 'Start timer', exact: true })
      .click();
    const done = panel.getByRole('article', { name: 'Finish tea', exact: true });
    await done.getByRole('button', { name: 'Dismiss', exact: true }).click({ timeout: 10_000 });
    await expect(done).toHaveCount(0);
    await work.restart();
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    await expect(work.page.getByRole('article', { name: 'Finish tea', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await work.close();
  }
});

test('the contextual desktop gateway discovers and starts a real timer with approval', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let receipt = '';
  let catalog = '';
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(user + 1).filter((message: any) => message.role === 'tool');
    if (!results.length)
      reply(body, res, '', [
        { function: { name: 'desktop', arguments: { action: 'discover', work: 'time' } } },
      ]);
    else if (results.length === 1) {
      catalog = String(results[0].content);
      reply(body, res, '', [
        {
          function: {
            name: 'desktop',
            arguments: {
              action: 'call',
              work: 'time',
              operation: 'timer.start',
              arguments_json: JSON.stringify({ title: 'Agent tea timer', durationSeconds: 30 }),
            },
          },
        },
      ]);
    } else {
      receipt = String(results.at(-1).content);
      reply(body, res, 'Saved the desktop timer. ' + receipt);
    }
    return true;
  });
  try {
    await start(work.page, 'Start a desktop timer for my tea for 30 seconds');
    const approval = work.page.getByRole('region', { name: 'Action approval' });
    await expect(approval).toBeVisible({ timeout: 60_000 });
    await approval.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    expect(catalog).toContain('timer.start');
    expect(catalog).not.toContain('workflow.create');
    expect(receipt).toContain('Agent tea timer');
    let context = work.page.getByRole('region', { name: 'Agent context' });
    await context.getByLabel('Search context').fill('Agent tea timer');
    await context.getByRole('button', { name: 'Open Agent tea timer', exact: true }).click();
    await expect(work.page.getByLabel('Workspace view')).toHaveValue('desktop');
    const timer = work.page
      .getByRole('region', { name: 'Desktop timers and reminders' })
      .getByRole('article', { name: 'Agent tea timer', exact: true });
    await expect(timer).toBeVisible();
    await expect(timer).toBeFocused();
    await timer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(timer).toContainText('Cancelled');
    await work.restart();
    await work.page
      .getByRole('button', { name: 'Start a desktop timer for my tea for 30 seconds', exact: true })
      .click();
    context = work.page.getByRole('region', { name: 'Agent context' });
    await context.getByLabel('Search context').fill('Agent tea timer');
    await expect(context).toContainText('cancelled');
    await context.getByRole('button', { name: 'Open Agent tea timer', exact: true }).click();
    await expect(
      work.page.getByRole('article', { name: 'Agent tea timer', exact: true }),
    ).toContainText('Cancelled');
  } finally {
    await work.close();
  }
});

test('a timer that expires while Dextana is quit returns as overdue and remains dismissible', async ({
  workspace,
}) => {
  test.setTimeout(180_000);
  const work = await workspace();
  try {
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    const panel = work.page.getByRole('region', { name: 'Desktop timers and reminders' });
    await panel.getByRole('button', { name: 'New timer', exact: true }).click();
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByLabel('Desktop alarm title')
      .fill('Overdue handoff');
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByLabel('Timer minutes')
      .fill('0.05');
    await work.page
      .getByRole('dialog', { name: 'New timer', exact: true })
      .getByRole('button', { name: 'Start timer', exact: true })
      .click();
    await expect(
      panel.getByRole('article', { name: 'Overdue handoff', exact: true }),
    ).toBeVisible();
    // Real shutdown and elapsed wall time exercise durable restoration, with no
    // fake clocks or test-only IPC mutation of application state.
    await work.restart(async () => {
      await new Promise((resolve) => setTimeout(resolve, 65_000));
    });
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    const timer = work.page
      .getByRole('region', { name: 'Desktop timers and reminders' })
      .getByRole('article', { name: 'Overdue handoff', exact: true });
    await expect(timer).toContainText('Overdue');
    await timer.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(timer).toHaveCount(0);
  } finally {
    await work.close();
  }
});

test('a referenced workbook opens through the desktop default app and displays native launch failures', async ({
  workspace,
}) => {
  test.setTimeout(90_000);
  const { join } = await import('node:path');
  const { realpath } = await import('node:fs/promises');
  const { default: ExcelJS } = await import('exceljs');
  const work = await workspace();
  const path = join(work.directory, 'Desktop budget.xlsx');
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Budget').addRows([
    ['Item', 'Amount'],
    ['Tea', 12],
  ]);
  await workbook.xlsx.writeFile(path);
  try {
    await work.app().evaluate(({ dialog, shell }, path) => {
      const state = globalThis as any;
      state.__desktopFileTest = {
        originalOpen: shell.openPath,
        originalDialog: dialog.showOpenDialog,
        opened: [],
        failure: '',
      };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
      // Only the native app-launch boundary is substituted. Reference ownership,
      // file validation, IPC and the renderer execute their real implementation.
      shell.openPath = async (file) => {
        state.__desktopFileTest.opened.push(file);
        return state.__desktopFileTest.failure;
      };
    }, path);
    await work.page.getByRole('button', { name: 'Attach files', exact: true }).click();
    await work.page
      .getByLabel('Describe your work')
      .fill('Keep the attached desktop budget workbook');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const context = work.page.getByRole('region', { name: 'Agent context' });
    await context.getByLabel('Search context').fill('Desktop budget.xlsx');
    await context.getByRole('button', { name: 'Open Desktop budget.xlsx', exact: true }).click();
    await expect
      .poll(() => work.app().evaluate(() => (globalThis as any).__desktopFileTest.opened.length))
      .toBe(1);
    expect(await work.app().evaluate(() => (globalThis as any).__desktopFileTest.opened[0])).toBe(
      await realpath(path),
    );
    await work.app().evaluate(() => {
      (globalThis as any).__desktopFileTest.failure = 'No spreadsheet application is associated';
    });
    await context.getByRole('button', { name: 'Open Desktop budget.xlsx', exact: true }).click();
    await expect(context.getByRole('alert')).toContainText(
      'No spreadsheet application is associated',
    );
  } finally {
    await work.app().evaluate(({ dialog, shell }) => {
      const state = globalThis as any;
      shell.openPath = state.__desktopFileTest.originalOpen;
      dialog.showOpenDialog = state.__desktopFileTest.originalDialog;
      delete state.__desktopFileTest;
    });
    await work.close();
  }
});

test('a one-time desktop reminder is created in its dialog, rings, and snoozes without model work', async ({
  workspace,
}) => {
  test.setTimeout(90_000);
  const work = await workspace();
  try {
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    const panel = work.page.getByRole('region', { name: 'Desktop timers and reminders' });
    await panel.getByRole('button', { name: 'New reminder', exact: true }).click();
    const dialog = work.page.getByRole('dialog', { name: 'New reminder', exact: true });
    await dialog.getByLabel('Desktop alarm title').fill('Review the invoice');
    const due = new Date(Date.now() + 8_000);
    const localDate = new Date(due.getTime() - due.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 19);
    await dialog.getByLabel('Reminder date and time').fill(localDate);
    await dialog.getByRole('button', { name: 'Save reminder', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const reminder = panel.getByRole('article', { name: 'Review the invoice', exact: true });
    await expect(reminder).toContainText('Scheduled');
    await expect(reminder).toContainText('Due now', { timeout: 15_000 });
    await reminder.getByRole('button', { name: 'Snooze 5 min', exact: true }).click();
    await expect(reminder).toContainText('Scheduled');
    await reminder.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(reminder).toHaveCount(0);
    expect(work.calls).toHaveLength(0);
  } finally {
    await work.close();
  }
});
