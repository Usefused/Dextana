import { expect, test } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { WorkFiles } from '../../src/main/files';

const signal = () => new AbortController().signal;
async function fixture(run: (files: WorkFiles, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-files-unit-'));
  try {
    await run(new WorkFiles(join(directory, 'artifacts')), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
test('document capabilities reject source files, traversal, symlinks, and oversized input', () =>
  fixture(async (files, directory) => {
    await expect(
      files.prepare({ action: 'create', path: 'app.js', content: 'alert(1)' }),
    ).rejects.toThrow('Supported work files');
    await expect(
      files.prepare({ action: 'create', path: '../brief.txt', content: '' }),
    ).rejects.toThrow('absolute path');
    const path = join(directory, 'brief.txt');
    await writeFile(path, 'Private document');
    await symlink(path, join(directory, 'link.txt'));
    const plan = await files.prepare({ action: 'read', path: join(directory, 'link.txt') });
    await expect(files.execute(plan, signal())).rejects.toThrow();
    await writeFile(path, Buffer.alloc(5_000_001));
    await expect(
      files.execute(await files.prepare({ action: 'read', path }), signal()),
    ).rejects.toThrow('5 MB');
  }));
test('creates literal Excel cells and reads the resulting workbook without running formulas', () =>
  fixture(async (files) => {
    const plan = await files.prepare({
      action: 'create',
      path: 'Budget.xlsx',
      sheets_json: JSON.stringify([
        {
          name: 'Budget',
          rows: [
            ['Description', 'Cost'],
            ['=HYPERLINK("https://example.com")', 250],
          ],
        },
      ]),
    });
    const result = await files.execute(plan, signal());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.path);
    expect(workbook.worksheets[0].getCell('A2').type).toBe(ExcelJS.ValueType.String);
    const read = await files.execute(
      await files.prepare({ action: 'read', path: result.path }),
      signal(),
    );
    expect('sheets' in read && read.sheets?.[0].rows[1][1]).toBe(250);
    await expect(files.execute(plan, signal())).rejects.toThrow('already exists');
  }));
test('CSV escapes cells and neutralizes spreadsheet formulas; cancellation cannot create files', () =>
  fixture(async (files) => {
    const plan = await files.prepare({
      action: 'create',
      path: 'Table.csv',
      sheets_json: JSON.stringify([
        {
          name: 'Table',
          rows: [
            ['Name', 'Value'],
            ['Comma, quote"', '=1+1'],
            ['Negative', -2],
          ],
        },
      ]),
    });
    const controller = new AbortController();
    controller.abort();
    await expect(files.execute(plan, controller.signal)).rejects.toThrow();
    await expect(readFile(plan.path)).rejects.toThrow();
    await files.execute(plan, signal());
    expect(await readFile(plan.path, 'utf8')).toContain('"Comma, quote""","\'=1+1"');
    expect(await readFile(plan.path, 'utf8')).toContain('"-2"');
  }));

test('reads text from attached Word and PDF documents', async () => {
  const { wordDocument, pdfDocument } = await import('../helpers/documents');
  await fixture(async (files, directory) => {
    for (const [extension, data] of [['docx', wordDocument('Word reference')], ['pdf', pdfDocument('PDF reference')]] as const) {
      const path = join(directory, `Reference.${extension}`);
      await writeFile(path, data);
      const result = await files.execute(await files.prepare({ action: 'read', path }), signal());
      expect(result).toMatchObject({ format: extension, content: expect.stringContaining(extension === 'docx' ? 'Word reference' : 'PDF reference') });
    }
    const path = join(directory, 'Scanned.pdf');
    await writeFile(path, pdfDocument(''));
    await expect(files.execute(await files.prepare({ action: 'read', path }), signal())).rejects.toThrow('no readable text layer');
  });
});
