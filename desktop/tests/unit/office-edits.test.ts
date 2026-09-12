import { expect, test } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import ExcelJS from 'exceljs';
import { WorkFiles } from '../../src/main/files';
import { wordDocument } from '../helpers/documents';
import { prepareOfficeEdit } from '../../src/main/office-edits';

const signal = new AbortController().signal;
async function fixture(run: (files: WorkFiles, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-office-edit-'));
  try { await run(new WorkFiles(directory), directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('DOCX edits across styled runs preserve other XML parts and show exact paragraph changes', () => fixture(async (files, directory) => {
  const path = join(directory, 'Notes.docx');
  const zip = new AdmZip(wordDocument('Original'));
  zip.updateFile('word/document.xml', Buffer.from(zip.readAsText('word/document.xml').replace('<w:r><w:t>Original</w:t></w:r>', '<w:r><w:rPr><w:b/></w:rPr><w:t>Budget: old </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>price. Keep me.</w:t></w:r>')));
  zip.addFile('word/media/image.png', Buffer.from([1, 2, 3]));
  zip.addFile('word/styles.xml', Buffer.from('<styles>untouched</styles>'));
  await writeFile(path, zip.toBuffer());
  const read = await files.execute(await files.prepare({ action: 'read', path }), signal);
  expect('paragraphs' in read && read.paragraphs).toEqual([{ paragraph: 1, text: 'Budget: old price. Keep me.' }]);
  const plan = await files.prepare({ action: 'edit', path, expected_revision: 'revision' in read ? read.revision : '', edits_json: JSON.stringify([{ paragraph: 1, find: 'old price', replace: '£300 & tax' }]) });
  expect(JSON.parse(files.preview(plan)).changes).toEqual([{ target: 'Paragraph 1', before: 'Budget: old price. Keep me.', after: 'Budget: £300 & tax. Keep me.' }]);
  await files.execute(plan, signal);
  const result = new AdmZip(await readFile(path));
  expect(result.readAsText('word/document.xml')).toContain('£300 &amp; tax');
  expect(result.readAsText('word/document.xml')).toContain('<w:b/>');
  expect(result.readAsText('word/document.xml')).toContain('<w:i/>');
  for (const part of ['word/media/image.png', 'word/styles.xml', '[Content_Types].xml']) expect(result.readFile(part)).toEqual(zip.readFile(part));
  const after = await files.execute(await files.prepare({ action: 'read', path }), signal);
  expect('content' in after && after.content).toContain('Budget: £300 & tax. Keep me.');
}));

test('XLSX cell edits preserve styles, formulas, extra sheets and opaque package parts', () => fixture(async (files, directory) => {
  const path = join(directory, 'Budget.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Budget');
  sheet.addRows([['Item', 'Amount'], ['Travel', 250], ['Total', { formula: 'B2*2', result: 500 }]]);
  sheet.getCell('B2').numFmt = '£#,##0.00'; sheet.getCell('B2').font = { bold: true };
  workbook.addWorksheet('Keep').getCell('A1').value = 'Untouched';
  const original = new AdmZip(Buffer.from(await workbook.xlsx.writeBuffer()));
  original.addFile('customXml/item1.xml', Buffer.from('<custom>untouched</custom>'));
  await writeFile(path, original.toBuffer());
  const read = await files.execute(await files.prepare({ action: 'read', path }), signal);
  const plan = await files.prepare({ action: 'edit', path, expected_revision: 'revision' in read ? read.revision : '', edits_json: JSON.stringify([{ sheet: 'Budget', cell: 'B2', value: 300 }, { sheet: 'Budget', cell: 'A2', value: '=literal text, not a formula' }]) });
  expect(JSON.parse(files.preview(plan)).changes[0]).toMatchObject({ target: 'Budget!B2', before: '250', after: '300' });
  await files.execute(plan, signal);
  const result = new AdmZip(await readFile(path));
  for (const entry of original.getEntries()) {
    if (!['xl/worksheets/sheet1.xml', 'xl/workbook.xml'].includes(entry.entryName)) expect(result.readFile(entry.entryName)).toEqual(entry.getData());
  }
  const edited = new ExcelJS.Workbook(); await edited.xlsx.readFile(path);
  expect(edited.getWorksheet('Budget')!.getCell('B2').value).toBe(300);
  expect(edited.getWorksheet('Budget')!.getCell('B2').numFmt).toBe('£#,##0.00');
  expect(edited.getWorksheet('Budget')!.getCell('B2').font.bold).toBe(true);
  expect(edited.getWorksheet('Budget')!.getCell('A2').type).toBe(ExcelJS.ValueType.String);
  expect(edited.getWorksheet('Budget')!.getCell('B3').formula).toBe('B2*2');
  expect(result.readAsText('xl/workbook.xml')).toContain('fullCalcOnLoad="1"');
  expect(edited.getWorksheet('Keep')!.getCell('A1').value).toBe('Untouched');
  await expect(files.execute(plan, signal)).rejects.toThrow('file changed');
}));

test('Word ambiguous matches and fields, Excel formulas and missing cells are rejected', async () => {
  expect(() => prepareOfficeEdit(wordDocument('same same'), 'docx', JSON.stringify([{ paragraph: 1, find: 'same', replace: 'new' }]))).toThrow('exactly once');
  const doc = new AdmZip(wordDocument('Original'));
  doc.updateFile('word/document.xml', Buffer.from(doc.readAsText('word/document.xml').replace('<w:t>', '<w:fldChar w:fldCharType="begin"/><w:t>')));
  expect(() => prepareOfficeEdit(doc.toBuffer(), 'docx', JSON.stringify([{ paragraph: 1, find: 'Original', replace: 'New' }]))).toThrow('complex');
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet('Sheet').getCell('A1').value = { formula: '1+1', result: 2 };
  const data = Buffer.from(await workbook.xlsx.writeBuffer());
  for (const [cell, error] of [['A1', 'formula'], ['B2', 'does not exist']]) expect(() => prepareOfficeEdit(data, 'xlsx', JSON.stringify([{ sheet: 'Sheet', cell, value: 5 }]))).toThrow(error);
});

test('UTF-8 configuration files can be read and edited; arbitrary binary data is refused', () => fixture(async (files, directory) => {
  const path = join(directory, 'settings.json');
  await writeFile(path, '{"enabled":false}\n');
  const read = await files.execute(await files.prepare({ action: 'read', path }), signal);
  const plan = await files.prepare({ action: 'edit', path, expected_revision: 'revision' in read ? read.revision : '', content: '{"enabled":true}\n' });
  await files.execute(plan, signal);
  expect(await readFile(path, 'utf8')).toBe('{"enabled":true}\n');
  const binary = join(directory, 'unknown.bin'); await writeFile(binary, Buffer.from([0, 255, 123]));
  await expect(files.execute(await files.prepare({ action: 'read', path: binary }), signal)).rejects.toThrow();
}));

test('protected Office documents, XML entities and shared formula ranges cannot be modified', async () => {
  const doc = new AdmZip(wordDocument('Original'));
  doc.addFile('word/settings.xml', Buffer.from('<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:documentProtection w:enforcement="1"/></w:settings>'));
  const wordEdit = JSON.stringify([{ paragraph: 1, find: 'Original', replace: 'New' }]);
  expect(() => prepareOfficeEdit(doc.toBuffer(), 'docx', wordEdit)).toThrow('protected');
  doc.deleteFile('word/settings.xml');
  doc.updateFile('word/document.xml', Buffer.from('<!DOCTYPE x [<!ENTITY external SYSTEM "file:///private">]><x/>'));
  expect(() => prepareOfficeEdit(doc.toBuffer(), 'docx', wordEdit)).toThrow('entities');
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Sheet');
  sheet.getCell('A1').value = { formula: '1+1', result: 2 }; sheet.getCell('A2').value = 2;
  const zip = new AdmZip(Buffer.from(await workbook.xlsx.writeBuffer()));
  const source = zip.readAsText('xl/worksheets/sheet1.xml').replace('<f>', '<f t="array" ref="A1:A2">');
  zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(source));
  const edit = JSON.stringify([{ sheet: 'Sheet', cell: 'A2', value: 3 }]);
  expect(() => prepareOfficeEdit(zip.toBuffer(), 'xlsx', edit)).toThrow('formula range');
  zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(source.replace('</sheetData>', '</sheetData><sheetProtection sheet="1"/>')));
  expect(() => prepareOfficeEdit(zip.toBuffer(), 'xlsx', edit)).toThrow('protected');
});
