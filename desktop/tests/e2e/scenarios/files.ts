import { updateBackendState } from '../backend-state';
import { expect } from '@playwright/test';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { start, reply } from '../fixture';

import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* documents(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
  let source = '';
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[lastUser].content;
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    if (prompt.includes('Keep this reference')) reply(body, res, 'Reference noted.');
    else if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'files',
            arguments: prompt.includes('Read')
              ? { action: 'read', path: source }
              : {
                  action: 'create',
                  path: 'Meeting.txt',
                  content: 'Meeting decisions: confirm the budget.',
                },
          },
        },
      ]);
    else reply(body, res, 'Document ready: ' + results.at(-1).content);
    return true;
  });
  try {
    source = join(work.directory, 'Context brief.txt');
    await writeFile(source, 'Context document contents');
    // Select a real path through the production picker IPC; only the native OS dialog is substituted.
    await work.app().evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, source);
    await work.page.getByRole('button', { name: 'Attach files' }).click();
    await expect(work.page.getByRole('region', { name: 'Attached files' })).toContainText(
      'Context brief.txt',
    );
    await work.page
      .getByLabel('Describe your work')
      .fill('Keep this reference https://example.com/budget');
    await work.page.getByRole('button', { name: 'Start activity' }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText('Reference noted', {
      timeout: 60_000,
    });
    const context = () => work.page.getByRole('region', { name: 'Agent context' });
    const filesGroup = context()
      .locator('details.context-group')
      .filter({ has: work.page.locator('summary', { hasText: 'Files' }) });
    const linksGroup = context()
      .locator('details.context-group')
      .filter({ has: work.page.locator('summary', { hasText: 'Links' }) });
    await expect(filesGroup).not.toHaveAttribute('open', '');
    await expect(linksGroup).not.toHaveAttribute('open', '');
    await expect(filesGroup.locator('summary')).toHaveText('Files1');
    await expect(linksGroup.locator('summary')).toHaveText('Links1');
    await expect(
      context().getByRole('button', { name: 'Show Context brief.txt in folder' }),
    ).not.toBeVisible();
    await filesGroup.locator('summary').click();
    await expect(
      context().getByRole('button', { name: 'Show Context brief.txt in folder' }),
    ).toBeVisible();
    await expect(linksGroup).not.toHaveAttribute('open', '');
    await linksGroup.locator('summary').focus();
    await work.page.keyboard.press('Enter');
    await expect(linksGroup.getByRole('button')).toBeVisible();
    await expect(context()).toContainText('Not read yet');
    await expect(
      work.page.locator('.message.user').first().getByRole('list', { name: 'Message attachments' }),
    ).toContainText('Context brief.txt');
    await expect(context()).toContainText('example.com/budget');
    expect(JSON.stringify(work.calls)).not.toContain('Context document contents');
    await work.page.getByLabel('Describe your work').fill('Read the attached brief');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate()).toBeVisible();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(context()).toContainText('Read');
    await expect(context()).not.toContainText('Not read');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Context document contents',
    );
    await work.page.getByLabel('Describe your work').fill('Create meeting notes');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate()).toBeVisible();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(context()).toContainText('Meeting.txt');
    await expect(context()).toContainText('Created');
    await expect(
      context().getByRole('button', { name: 'Show Meeting.txt in folder' }),
    ).toBeVisible();
    await work.page.screenshot({ path: testInfo.outputPath('document-context.png') });
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    const title = await work.page.evaluate(
      async () => (await window.dextana.snapshot()).activities[0].title,
    );
    await start(work.page, 'Keep this reference for a separate chat');
    await expect(work.page.getByTestId('assistant-message')).toContainText('Reference noted');
    await expect(context()).not.toContainText('Meeting.txt');
    await expect(context()).not.toContainText('example.com/budget');
    // Simulate a saved chat from the version before context tracking existed.
    yield async () => {
      const savedState = JSON.parse(await readFile(join(work.directory, 'state.json'), 'utf8'));
      updateBackendState(work.directory, state => {
        const legacy = state.activities.find((activity: any) => activity.title === 'Keep this reference for a separate chat');
        delete legacy.context;
        legacy.messages[0].content += ' https://example.com/legacy-reference';
        delete savedState.activities.find((activity: any) => activity.id === legacy.id).context;
      });
      await writeFile(join(work.directory, 'state.json'), JSON.stringify(savedState));
    };
    await work.page
      .getByRole('button', { name: 'Keep this reference for a separate chat', exact: true })
      .click();
    await expect(context()).toContainText('example.com/legacy-reference');
    await work.page.getByRole('button', { name: title, exact: true }).click();
    await expect(
      work.page.locator('.message.user').first().getByRole('list', { name: 'Message attachments' }),
    ).toContainText('Context brief.txt');
    await expect(context()).toContainText('Meeting.txt');
    await expect(context()).toContainText('example.com/budget');
    await expect(context().locator('details.context-group[open]')).toHaveCount(0);
  } finally {
    await work.close();
  }
}
