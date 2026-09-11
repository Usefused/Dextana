import { expect } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, start, reply } from './fixture';

test('agent edits show exact before/after, require consent even with session access, and reject stale files', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let path = '';
  const work = await workspace((body, res) => {
    const last = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(last + 1).filter((message: any) => message.role === 'tool');
    if (!results.length)
      reply(body, res, '', [{ function: { name: 'files', arguments: { action: 'read', path } } }]);
    else if (results.length === 1) {
      const result = JSON.parse(results[0].content);
      expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
      reply(body, res, '', [
        {
          function: {
            name: 'files',
            arguments: {
              action: 'edit',
              path,
              content: 'Budget: 300\nKeep these notes.\n',
              expected_revision: result.revision,
            },
          },
        },
      ]);
    } else reply(body, res, 'Edit result: ' + results.at(-1).content);
    return true;
  });
  try {
    path = join(work.directory, 'Budget notes.txt');
    await writeFile(path, 'Budget: 250\nKeep these notes.\n');
    await start(work.page, 'Update my budget notes');
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText('Read document', { timeout: 60_000 });
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(gate.getByRole('button', { name: 'Apply changes' })).toBeVisible();
    await expect(gate.getByRole('region', { name: 'Current file content' })).toContainText(
      'Budget: 250',
    );
    await expect(gate.getByRole('region', { name: 'Proposed file content' })).toContainText(
      'Budget: 300',
    );
    await expect(gate.getByRole('button', { name: 'Allow all', exact: true })).toHaveCount(0);
    expect(await readFile(path, 'utf8')).toBe('Budget: 250\nKeep these notes.\n');
    await gate.getByRole('button', { name: 'Keep original' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    expect(await readFile(path, 'utf8')).toContain('Budget: 250');
    await work.page.getByRole('button', { name: 'Chat settings', exact: true }).click();
    await work.page.getByLabel('Session approvals').selectOption('allow');
    await work.page.keyboard.press('Escape');
    await work.page.getByLabel('Describe your work').fill('Please update those notes now');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate.getByRole('button', { name: 'Apply changes' })).toBeVisible();
    await gate.getByRole('button', { name: 'Apply changes' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    expect(await readFile(path, 'utf8')).toBe('Budget: 300\nKeep these notes.\n');
    await expect(work.page.getByRole('region', { name: 'Agent context' })).toContainText('Edited');
    await writeFile(path, 'Budget: 400\nKeep these notes.\n');
    await work.page.getByLabel('Describe your work').fill('Update the notes again');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate.getByRole('button', { name: 'Apply changes' })).toBeVisible();
    await writeFile(path, 'Newer changes made outside Dextana');
    await gate.getByRole('button', { name: 'Apply changes' }).click();
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('file changed');
    expect(await readFile(path, 'utf8')).toBe('Newer changes made outside Dextana');
  } finally {
    await work.close();
  }
});

for (const format of ['docx', 'xlsx'] as const) {
  test(`agent proposes reviewed ${format} changes and preserves original on denial`, async ({
    workspace,
  }) => {
    test.setTimeout(120_000);
    let path = '';
    const work = await workspace((body, res) => {
      const last = body.messages.findLastIndex((message: any) => message.role === 'user');
      const results = body.messages
        .slice(last + 1)
        .filter((message: any) => message.role === 'tool');
      if (!results.length)
        reply(body, res, '', [
          { function: { name: 'files', arguments: { action: 'read', path } } },
        ]);
      else if (results.length === 1) {
        const result = JSON.parse(results[0].content);
        expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
        if (format === 'docx')
          expect(result.paragraphs[0]).toMatchObject({
            paragraph: 1,
            text: 'Original budget: 250',
          });
        const edits =
          format === 'docx'
            ? [{ paragraph: 1, find: '250', replace: '300' }]
            : [{ sheet: 'Budget', cell: 'B2', value: 300 }];
        reply(body, res, '', [
          {
            function: {
              name: 'files',
              arguments: {
                action: 'edit',
                path,
                expected_revision: result.revision,
                edits_json: JSON.stringify(edits),
              },
            },
          },
        ]);
      } else reply(body, res, 'Edit result: ' + results.at(-1).content);
      return true;
    });
    try {
      path = join(work.directory, `Budget.${format}`);
      const ExcelJS = (await import('exceljs')).default;
      if (format === 'docx') {
        const { wordDocument } = await import('../helpers/documents');
        await writeFile(path, wordDocument('Original budget: 250'));
      } else {
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet('Budget').addRows([
          ['Item', 'Amount'],
          ['Travel', 250],
        ]);
        await workbook.xlsx.writeFile(path);
      }
      const original = await readFile(path);
      await start(work.page, `Update my ${format} budget`);
      const gate = work.page.getByRole('region', { name: 'Action approval' });
      await expect(gate).toContainText('Read document', { timeout: 60_000 });
      await gate.getByRole('button', { name: 'Allow all', exact: true }).click();
      const change = gate.getByRole('region', {
        name: format === 'docx' ? 'Paragraph 1' : 'Budget!B2',
        exact: true,
      });
      await expect(change).toContainText('250');
      await expect(change).toContainText('300');
      expect(await readFile(path)).toEqual(original);
      await gate.getByRole('button', { name: 'Keep original' }).click();
      await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
      expect(await readFile(path)).toEqual(original);
      await work.page.getByLabel('Describe your work').fill('Apply the budget update');
      await work.page.getByRole('button', { name: 'Send message' }).click();
      await expect(change).toContainText('300');
      await gate.getByRole('button', { name: 'Apply changes' }).click();
      await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(path);
        expect(workbook.getWorksheet('Budget')!.getCell('B2').value).toBe(300);
      } else {
        const { default: mammoth } = await import('mammoth');
        expect((await mammoth.extractRawText({ path })).value).toContain('Original budget: 300');
      }
      await expect(work.page.getByRole('region', { name: 'Agent context' })).toContainText(
        'Edited',
      );
    } finally {
      await work.close();
    }
  });
}

test('agent fills reviewed PDF fields and keeps the form interactive', async ({ workspace }) => {
  test.setTimeout(120_000);
  let path = '';
  const work = await workspace((body, res) => {
    const last = body.messages.findLastIndex((message: any) => message.role === 'user');
    const results = body.messages.slice(last + 1).filter((message: any) => message.role === 'tool');
    if (!results.length) {
      reply(body, res, '', [{ function: { name: 'files', arguments: { action: 'read', path } } }]);
    } else if (results.length === 1) {
      const result = JSON.parse(results[0].content);
      expect(result.form_fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Applicant name', type: 'text' }),
          expect.objectContaining({ name: 'Consent', type: 'checkbox' }),
        ]),
      );
      reply(body, res, '', [
        {
          function: {
            name: 'files',
            arguments: {
              action: 'edit',
              path,
              expected_revision: result.revision,
              edits_json: JSON.stringify([
                { field: 'Applicant name', value: 'Alex Morgan' },
                { field: 'Consent', value: true },
              ]),
            },
          },
        },
      ]);
    } else reply(body, res, 'Edit result: ' + results.at(-1).content);
    return true;
  });
  try {
    path = join(work.directory, 'Application.pdf');
    const { pdfFormDocument } = await import('../helpers/documents');
    await writeFile(path, await pdfFormDocument());
    await start(work.page, 'Fill in this PDF form');
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText('Read document', { timeout: 60_000 });
    await gate.getByRole('button', { name: 'Allow all', exact: true }).click();
    const name = gate.getByRole('region', { name: 'PDF field “Applicant name”', exact: true });
    await expect(name).toContainText('Original applicant');
    await expect(name).toContainText('Alex Morgan');
    await expect(gate).toContainText('form remains interactive');
    await gate.getByRole('button', { name: 'Apply changes' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    const { PDFDocument } = await import('pdf-lib');
    const document = await PDFDocument.load(await readFile(path));
    expect(document.getForm().getTextField('Applicant name').getText()).toBe('Alex Morgan');
    expect(document.getForm().getCheckBox('Consent').isChecked()).toBe(true);
    expect(
      document.getForm().getTextField('Applicant name').acroField.getWidgets(),
    ).not.toHaveLength(0);
  } finally {
    await work.close();
  }
});
