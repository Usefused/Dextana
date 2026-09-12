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
    await gate().getByRole('button', { name: 'Allow all', exact: true }).click();
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
    await gate().getByRole('button', { name: 'Allow all', exact: true }).click();
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
  test.setTimeout(120_000);
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
    await expect(work.page.getByTestId('assistant-message')).toContainText('Ready for references.', { timeout: 60_000 });
    const context = () => work.page.getByRole('region', { name: 'Agent context' });
    await expect(context().getByRole('heading', { name: 'Context', exact: true })).toBeVisible();
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

test('Context keeps its header fixed and scrolls expanded lists with a discoverable scrollbar', async ({ workspace }) => {
  const work = await workspace();
  try {
    const paths = Array.from({ length: 10 }, (_, i) => join(work.directory, `Scroll reference ${i}.txt`));
    await Promise.all(paths.map(path => writeFile(path, 'Reference')));
    await start(work.page, 'Organize scrollable context references');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await work.app().evaluate(({ dialog }, filePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
    }, paths);
    const panel = work.page.getByRole('region', { name: 'Agent context' });
    await panel.getByRole('button', { name: 'Attach context files' }).click();
    await expect(panel.locator('.context-group summary').first()).toContainText('10');
    await expect(panel.locator('.context-group').first()).toHaveAttribute('open', '');
    const list = panel.getByRole('region', { name: 'Files in context' });
    const header = panel.getByRole('heading', { name: 'Context', exact: true });
    const before = await header.boundingBox();
    expect(await list.evaluate(el => el.clientHeight)).toBeGreaterThan(180);
    expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await list.evaluate(el => getComputedStyle(el).scrollbarWidth)).toBe('thin');
    await list.focus();
    await work.page.keyboard.press('End');
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await header.boundingBox()).toEqual(before);
    expect(await panel.evaluate(el => el.scrollTop)).toBe(0);
    await expect(panel.getByRole('button', { name: 'Attach context files' })).toBeVisible();
  } finally { await work.close(); }
});
