import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('chat completions and approvals notify when another chat is selected, with direct navigation', async ({
  workspace,
}) => {
  test.setTimeout(90_000);
  const finish = new Map<string, (approval?: boolean) => void>();
  const work = await workspace((body, response) => {
    const prompt = body.messages.findLast((message: any) => message.role === 'user')?.content;
    if (!prompt?.startsWith('Notify ')) return false;
    finish.set(prompt, (approval) =>
      reply(
        body,
        response,
        approval ? '' : 'Work complete.',
        approval
          ? [
              {
                function: {
                  name: 'browser',
                  arguments: { action: 'open', url: 'https://example.com' },
                },
              },
            ]
          : undefined,
      ),
    );
    return true;
  });
  const notices = async (id: string) =>
    (await work.page.evaluate(() => window.dextana.snapshot())).notifications?.filter(
      (item) =>
        item.source === 'Chats' &&
        item.target?.kind === 'activity' &&
        item.target.activityId === id,
    ) ?? [];
  const launch = async (prompt: string) => {
    await start(work.page, prompt);
    await expect.poll(() => finish.has(prompt)).toBe(true);
    await expect(work.page.getByRole('heading', { name: prompt, exact: true })).toBeVisible();
    await work.app().evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0].focus();
    });
    await expect
      .poll(() =>
        work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused()),
      )
      .toBe(true);
    return (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(
      (item) => item.title === prompt,
    )!.id;
  };
  try {
    const a = await launch('Notify first chat');
    const b = await launch('Notify second chat');
    finish.get('Notify first chat')!();
    await expect.poll(() => notices(a)).toHaveLength(1);
    await work.page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const inbox = work.page.getByRole('dialog', { name: 'Notifications', exact: true });
    await inbox
      .getByRole('article', { name: 'Chat finished', exact: true })
      .filter({ hasText: 'Notify first chat' })
      .getByRole('button', { name: 'View', exact: true })
      .click();
    await expect(
      work.page.getByRole('heading', { name: 'Notify first chat', exact: true }),
    ).toBeVisible();
    expect((await notices(a))[0].readAt).toBeTruthy();
    finish.get('Notify second chat')!();
    await expect.poll(() => notices(b)).toHaveLength(1);
    const current = await launch('Notify current chat');
    finish.get('Notify current chat')!();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    const approval = await launch('Notify approval chat');
    await work.page.getByRole('button', { name: 'Notify current chat', exact: true }).click();
    finish.get('Notify approval chat')!(true);
    await expect
      .poll(() => notices(approval))
      .toEqual([expect.objectContaining({ title: 'Approval needed' })]);
    expect(await notices(current)).toHaveLength(0);
    expect(await notices(a)).toHaveLength(1);
  } finally {
    await work.close();
  }
});

test('reminders stay quiet on their focused page or chat and clear when returning', async ({
  workspace,
}) => {
  test.setTimeout(90_000);
  const work = await workspace();
  try {
    await start(work.page, 'Keep my reminder context');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const activityId = (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(
      (item) => item.title === 'Keep my reminder context',
    )!.id;
    const createReminder = (title: string) =>
      work.page.evaluate(
        ({ title, activityId }) =>
          window.dextana.desktopAlarm({
            operation: 'reminder.create',
            title,
            message: 'Review the draft',
            dueAt: new Date(Date.now() + 1500).toISOString(),
            sourceActivityId: activityId,
          }),
        { title, activityId },
      );
    const notice = async (title: string) =>
      (await work.page.evaluate(() => window.dextana.snapshot())).notifications?.find(
        (item) => item.title === title,
      );
    const toast = work.page.locator('.notification-toast');

    await work.app().evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0].focus();
    });
    await expect
      .poll(() =>
        work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused()),
      )
      .toBe(true);
    await createReminder('Visible chat reminder');
    await expect.poll(async () => (await notice('Visible chat reminder'))?.readAt).toBeTruthy();
    await expect(toast).toHaveCount(0);

    await work.page
      .getByRole('region', { name: 'Agent context' })
      .getByLabel('Search context')
      .fill('Visible chat reminder');
    await work.page
      .getByRole('button', { name: 'Open Visible chat reminder', exact: true })
      .click();
    await createReminder('Visible page reminder');
    await expect.poll(async () => (await notice('Visible page reminder'))?.readAt).toBeTruthy();
    await expect(toast).toHaveCount(0);
    const reminder = work.page
      .getByRole('region', { name: 'Desktop timers and reminders' })
      .getByRole('article', { name: 'Visible page reminder', exact: true });
    await expect(reminder).toContainText('Due now');
    expect((await notice('Visible page reminder'))?.dismissedAt).toBeUndefined();

    await work.page.getByRole('button', { name: 'Workflows', exact: true }).click();
    await createReminder('Away page reminder');
    await expect(toast).toContainText('Away page reminder', { timeout: 15_000 });
    expect((await notice('Away page reminder'))?.readAt).toBeUndefined();
    await work.page.getByRole('button', { name: 'Timers and reminders', exact: true }).click();
    await expect(toast).toHaveCount(0, { timeout: 2000 });
    await expect.poll(async () => (await notice('Away page reminder'))?.readAt).toBeTruthy();
  } finally {
    await work.close();
  }
});

test('background timers publish into a persistent inbox with unread, navigation and dismissal', async ({
  workspace,
}, info) => {
  const work = await workspace();
  try {
    expect(
      await work.page
        .getByRole('button', { name: 'Notifications', exact: true })
        .evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
    ).toBe('no-drag');
    // This worker shares a disposable workspace with the other desktop scenarios.
    await work.page.evaluate(async () => {
      for (const item of (await window.dextana.snapshot()).notifications ?? [])
        if (!item.dismissedAt)
          await window.dextana.notification({ action: 'dismiss', id: item.id });
    });
    await work.page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const inbox = () => work.page.getByRole('dialog', { name: 'Notifications', exact: true });
    await expect(inbox().getByText(/You’re all caught up/)).toBeVisible();
    await inbox().getByRole('button', { name: 'Close notifications' }).click();
    await work.page.evaluate(() =>
      window.dextana.desktopAlarm({
        operation: 'timer.start',
        title: 'Import finished',
        message: 'The background import is ready.',
        durationSeconds: 1,
      }),
    );
    await expect(
      work.page
        .getByRole('button', { name: 'Notifications', exact: true })
        .getByLabel('1 unread notifications'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(work.page.locator('.notification-toast')).toContainText('Import finished');
    await work.page.getByRole('button', { name: 'Notifications', exact: true }).click();
    const item = () => inbox().getByRole('article', { name: 'Import finished', exact: true });
    await expect(item()).toContainText('Timers');
    await item().getByRole('button', { name: 'View', exact: true }).click();
    await expect(work.page.getByLabel('Workspace view')).toHaveValue('desktop');
    await expect(
      work.page.getByRole('article', { name: 'Import finished', exact: true }),
    ).toBeVisible();
    await expect(work.page.getByLabel('1 unread notifications')).toHaveCount(0);
    await work.restart();
    await work.page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(item()).toHaveCount(1);
    await expect(item().getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0);
    await work.page.screenshot({ path: info.outputPath('notification-inbox.png') });
    await item().getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(inbox().getByText(/You’re all caught up/)).toBeVisible();
    await work.restart();
    await work.page.getByRole('button', { name: 'Notifications', exact: true }).click();
    await expect(inbox().getByText(/You’re all caught up/)).toBeVisible();
  } finally {
    await work.close();
  }
});
