import { expect } from '@playwright/test';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { test, start, reply } from './fixture';

test('file reads and workbook creation require separate consent and preserve documents', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  let source = '';
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[lastUser].content;
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'files',
            arguments: prompt.includes('Read')
              ? { action: 'read', path: source }
              : {
                  action: 'create',
                  path: 'Budget.xlsx',
                  sheets_json: JSON.stringify([
                    {
                      name: 'Budget',
                      rows: [
                        ['Item', 'Amount'],
                        ['Travel', 250],
                        ['Supplies', 80],
                      ],
                    },
                  ]),
                },
          },
        },
      ]);
    else reply(body, res, 'File result: ' + results.at(-1).content);
    return true;
  });
  try {
    source = join(work.directory, 'brief.txt');
    await writeFile(source, 'Quarterly travel budget: 250.');
    const target = join(work.directory, 'artifacts', 'Budget.xlsx');
    await start(work.page, 'Read my brief');
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate()).toContainText(source, { timeout: 60_000 });
    expect(JSON.stringify(work.calls)).not.toContain('Quarterly travel budget');
    await gate().getByRole('button', { name: 'Deny action' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    expect(JSON.stringify(work.calls)).not.toContain('Quarterly travel budget');
    await start(work.page, 'Read my brief with permission');
    await expect(gate()).toBeVisible();
    await gate().getByLabel('Auto-allow file reads in this chat').check();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'Quarterly travel budget',
    );
    await work.page.getByLabel('Describe your work').fill('Create my budget workbook');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate()).toContainText(target);
    await expect(gate()).toContainText('Travel');
    await expect(gate().getByRole('table', { name: 'Budget preview' })).toBeVisible();
    await work.page.screenshot({ path: testInfo.outputPath('workbook-approval.png') });
    await expect(access(target)).rejects.toThrow();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Budget.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(target);
    expect(workbook.getWorksheet('Budget')!.getCell('B2').value).toBe(250);
    const original = await readFile(target);
    source = target;
    await work.page.getByLabel('Describe your work').fill('Read the workbook');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('250');
    await expect(gate()).toHaveCount(0);
    await work.page.getByLabel('Describe your work').fill('Create the same workbook again');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate()).toBeVisible();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('already exists');
    expect(await readFile(target)).toEqual(original);
  } finally {
    await work.close();
  }
});

test('context lists attached and read documents, created workbooks, and URLs per chat across restart', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
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
    await expect(work.page.getByTestId('assistant-message')).toContainText('Reference noted');
    const context = () => work.page.getByRole('region', { name: 'Agent context' });
    await expect(context()).toContainText('Selected · Not read');
    await expect(work.page.locator('.message.user').first().getByRole('list', { name: 'Message attachments' })).toContainText('Context brief.txt');
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
    const savedState = JSON.parse(await readFile(join(work.directory, 'state.json'), 'utf8'));
    delete savedState.activities[0].context;
    savedState.activities[0].messages[0].content += ' https://example.com/legacy-reference';
    await writeFile(join(work.directory, 'state.json'), JSON.stringify(savedState));
    await work.restart();
    await work.page.getByRole('button', { name: 'Keep this reference for a separate chat', exact: true }).click();
    await expect(context()).toContainText('example.com/legacy-reference');
    await work.page.getByRole('button', { name: title, exact: true }).click();
    await expect(work.page.locator('.message.user').first().getByRole('list', { name: 'Message attachments' })).toContainText('Context brief.txt');
    await expect(context()).toContainText('Meeting.txt');
    await expect(context()).toContainText('example.com/budget');
  } finally {
    await work.close();
  }
});

test('CSV creation can be denied, auto-allowed in one chat, and cancelled in another', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    const path = body.messages[lastUser].content.includes('second table')
      ? 'Second.csv'
      : 'Contacts.csv';
    if (!results.length)
      reply(body, res, '', [
        {
          function: {
            name: 'files',
            arguments: {
              action: 'create',
              path,
              sheets_json: JSON.stringify([
                {
                  name: 'Contacts',
                  rows: [
                    ['Name', 'City'],
                    ['Alex', 'London'],
                  ],
                },
              ]),
            },
          },
        },
      ]);
    else reply(body, res, 'File result: ' + results.at(-1).content);
    return true;
  });
  try {
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await start(work.page, 'Create a contacts CSV');
    await expect(gate()).toContainText('Contacts.csv', { timeout: 60_000 });
    await gate().getByRole('button', { name: 'Deny action' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await expect(access(join(work.directory, 'artifacts/Contacts.csv'))).rejects.toThrow();
    await start(work.page, 'Create my contacts table');
    await expect(gate()).toBeVisible();
    await gate().getByLabel('Auto-allow file creation in this chat').check();
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText('Contacts.csv');
    expect(await readFile(join(work.directory, 'artifacts/Contacts.csv'), 'utf8')).toBe(
      '"Name","City"\r\n"Alex","London"',
    );
    await work.page.getByLabel('Describe your work').fill('Create a second table');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Second.csv');
    await expect(gate()).toHaveCount(0);
    await start(work.page, 'Create contacts in another chat');
    await expect(gate()).toBeVisible();
    await work.page.getByRole('button', { name: 'Stop activity' }).click();
    await expect(gate()).toHaveCount(0);
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
  } finally {
    await work.close();
  }
});

test('Context plus attaches documents and the agent reads Word and PDF after approval', async ({ workspace }) => {
  const { wordDocument, pdfDocument } = await import('../helpers/documents');
  let paths: string[] = [];
  const work = await workspace((body, res) => {
    const lastUser = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[lastUser].content;
    const results = body.messages.slice(lastUser + 1).filter((m: any) => m.role === 'tool');
    if (!prompt.includes('Read')) reply(body, res, 'Ready for references.');
    else if (!results.length) reply(body, res, '', [{ function: { name: 'files', arguments: { action: 'read', path: paths[prompt.includes('Word') ? 0 : 1] } } }]);
    else reply(body, res, 'Document says: ' + results.at(-1).content);
    return true;
  });
  try {
    paths = [join(work.directory, 'Reference.docx'), join(work.directory, 'Reference.pdf')];
    await writeFile(paths[0], wordDocument('Word attachment text'));
    await writeFile(paths[1], pdfDocument('PDF attachment text'));
    await start(work.page, 'Prepare for references');
    await expect(work.page.getByTestId('assistant-message')).toContainText('Ready for references.');
    const context = () => work.page.getByRole('region', { name: 'Agent context' });
    await expect(context().locator('summary')).toHaveText('Context');
    await work.app().evaluate(({ dialog }, filePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
    }, paths);
    await context().getByRole('button', { name: 'Attach context files' }).click();
    await expect(context()).toContainText('Reference.docx');
    await expect(context()).toContainText('Reference.pdf');
    expect(JSON.stringify(work.calls)).not.toContain('Word attachment text');
    const saved = JSON.parse(await readFile(join(work.directory, 'state.json'), 'utf8'));
    expect(saved.activities[0].context.filter((item: any) => item.kind === 'file')).toHaveLength(2);
    for (const format of ['Word', 'PDF']) {
      await work.page.getByLabel('Describe your work').fill(`Read the ${format} attachment`);
      await work.page.getByRole('button', { name: 'Send message' }).click();
      const gate = work.page.getByRole('region', { name: 'Action approval' });
      await expect(gate).toBeVisible();
      await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
      await expect(work.page.getByTestId('assistant-message').last()).toContainText(`${format} attachment text`);
    }
  } finally { await work.close(); }
});
