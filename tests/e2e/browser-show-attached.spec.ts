import { expect } from '@playwright/test';
import { browserFixture } from '../helpers/user-browser';
import { test, start, reply, allowBrowser } from './fixture';

test('viewing in-app tabs works with an attached or stopped Chrome connection without changing the agent target', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const fixture = await browserFixture();
  const title = 'View saved tabs while Chrome is connected';
  let inspectAttached = false;
  let readRequested = false;
  let result = '';
  const work = await workspace((body, res) => {
    if (inspectAttached) {
      if (!readRequested) {
        readRequested = true;
        reply(body, res, '', [{ function: { name: 'browser', arguments: { action: 'read' } } }]);
      } else {
        result = String(
          body.messages.filter((message: any) => message.role === 'tool').at(-1)?.content,
        );
        reply(body, res, 'The attached Chrome tab is still the target.');
      }
    } else if (!body.messages.some((message: any) => message.role === 'tool')) {
      reply(body, res, '', [
        {
          function: {
            name: 'browser',
            arguments: { action: 'open', url: fixture.origin + '/embedded' },
          },
        },
      ]);
    } else reply(body, res, 'In-app page ready.');
    return true;
  });
  const pane = work.page.getByRole('complementary', { name: 'In-app browser' });
  const connectionState = () =>
    work.page.evaluate(async (title) => {
      const snapshot = await window.dextana.snapshot();
      const activity = snapshot.activities.find((activity) => activity.title === title)!;
      return snapshot.userBrowsers?.find((connection) => connection.activityId === activity.id)
        ?.state;
    }, title);
  async function showBrowser() {
    await work.page.getByRole('button', { name: 'Show browser', exact: true }).click();
    await expect(pane).toBeVisible();
    await expect(work.page.getByText(/The browser selection changed/)).toHaveCount(0);
  }
  try {
    await start(work.page, title);
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await pane.getByRole('button', { name: 'New browser tab', exact: true }).click();
    await work.page.getByLabel('New tab address', { exact: true }).fill(fixture.origin + '/second');
    await work.page.getByRole('button', { name: 'Open new tab', exact: true }).click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(
      fixture.origin + '/second',
    );
    await pane.getByRole('button', { name: 'Close browser pane', exact: true }).click();
    await work.page.getByRole('button', { name: 'Use my browser', exact: true }).click();
    await work.page.getByRole('button', { name: 'Create connection code' }).click();
    const code = await work.page.getByLabel('Browser control connection code').inputValue();
    await fixture.attach(code);
    await expect.poll(connectionState).toBe('connected');
    await work.page.getByRole('button', { name: 'Close Use my browser', exact: true }).click();

    await showBrowser();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(
      fixture.origin + '/second',
    );
    // Both tabs belong to this test's chat; switching uses browser:show with an explicit tab ID.
    const tabs = pane.getByRole('tab', { name: new RegExp(title) });
    await expect(tabs).toHaveCount(2);
    await tabs.first().click();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(
      fixture.origin + '/embedded',
    );
    await expect.poll(connectionState).toBe('connected');
    await expect(fixture.page).toHaveURL(fixture.origin + '/');
    expect(
      await work.app().evaluate(({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children.at(
          -1,
        ) as import('electron').WebContentsView;
        return view.getVisible();
      }),
    ).toBe(true);

    inspectAttached = true;
    await work.page.getByLabel('Describe your work').fill('Inspect the attached Chrome tab.');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    // The initial allowBrowser granted browser actions for this test chat.
    await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
      'The attached Chrome tab is still the target.',
      { timeout: 60_000 },
    );
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    expect(result).toContain(fixture.origin + '/');
    expect(result).not.toContain('/embedded');
    expect(result).not.toContain('/second');
    await expect.poll(connectionState).toBe('connected');
    await fixture.popup.locator('#control-stop').click();
    await expect.poll(connectionState).toBe('stopped');
    await pane.getByRole('button', { name: 'Close browser pane', exact: true }).click();
    await showBrowser();
    await expect(work.page.getByLabel('Activity browser address')).toHaveValue(
      fixture.origin + '/embedded',
    );
    await expect.poll(connectionState).toBe('stopped');
    expect(fixture.errors).toEqual([]);
  } finally {
    await fixture.close();
    await work.close();
  }
});
