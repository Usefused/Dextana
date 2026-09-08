import { constants } from 'node:fs';
import { open, mkdir, realpath, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';

export const documentExtensions = ['txt', 'md', 'csv', 'xlsx', 'docx', 'pdf'];
const maxBytes = 5_000_000;
const maxText = 500_000;
type Sheet = { name: string; rows: (string | number | boolean | null)[][] };
export interface FilePlan {
  action: 'read' | 'create';
  path: string;
  format: string;
  content: string;
  sheets: Sheet[];
  parent: string;
  parentIdentity: string;
  makeDirectory: boolean;
}
function identity(info: { dev: number; ino: number }) {
  return `${info.dev}:${info.ino}`;
}
export class WorkFiles {
  constructor(private outputDirectory: string) {}
  async prepare(args: Record<string, unknown>): Promise<FilePlan> {
    if (!['read', 'create'].includes(String(args.action)))
      throw new Error('Choose read or create.');
    const action = args.action as FilePlan['action'];
    if (
      typeof args.path !== 'string' ||
      !args.path.trim() ||
      args.path.length > 4096 ||
      /[\x00-\x1f]/.test(args.path)
    )
      throw new Error('Provide a document path.');
    if (
      !isAbsolute(args.path) &&
      (action === 'read' ||
        basename(args.path) !== args.path ||
        args.path === '.' ||
        args.path === '..')
    )
      throw new Error('Reading needs an absolute path. Create with a filename or absolute path.');
    const path = isAbsolute(args.path) ? resolve(args.path) : join(this.outputDirectory, args.path);
    const format = extname(path).slice(1).toLowerCase();
    if (!documentExtensions.includes(format))
      throw new Error(
        'Supported work files: Excel (.xlsx), Word (.docx), PDF, CSV, text (.txt), and Markdown (.md).',
      );
    if (action === 'create' && ['pdf', 'docx'].includes(format)) throw new Error('PDF and DOCX are supported for reading. Create an XLSX, CSV, TXT or Markdown document instead.');
    let parent = dirname(path);
    let makeDirectory = false;
    try {
      parent = await realpath(parent);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
        dirname(path) !== this.outputDirectory ||
        action !== 'create'
      )
        throw new Error('Choose an existing destination folder.');
      parent = await realpath(dirname(this.outputDirectory));
      makeDirectory = true;
    }
    const info = await stat(parent);
    if (!info.isDirectory()) throw new Error('Choose a document folder.');
    const canonicalPath = makeDirectory
      ? join(parent, basename(this.outputDirectory), basename(path))
      : join(parent, basename(path));
    const content = args.content ?? '';
    if (typeof content !== 'string' || content.length > maxText)
      throw new Error('Document text is limited to 500,000 characters.');
    let sheets: Sheet[] = [];
    if (action === 'create' && ['xlsx', 'csv'].includes(format)) {
      if (typeof args.sheets_json !== 'string' || args.sheets_json.length > maxText)
        throw new Error('Provide sheets_json for a spreadsheet.');
      try {
        sheets = JSON.parse(args.sheets_json);
      } catch {
        throw new Error('sheets_json must be valid JSON.');
      }
      if (!Array.isArray(sheets) || !sheets.length || sheets.length > (format === 'csv' ? 1 : 20))
        throw new Error('Provide 1–20 sheets, or one table for CSV.');
      let cells = 0;
      const names = new Set<string>();
      for (const sheet of sheets) {
        if (
          !sheet ||
          typeof sheet.name !== 'string' ||
          !sheet.name.trim() ||
          sheet.name.length > 31 ||
          /[\\/*?:\[\]]/.test(sheet.name) ||
          names.has(sheet.name.toLowerCase())
        )
          throw new Error('Sheet names must be unique and valid Excel names (1–31 characters).');
        names.add(sheet.name.toLowerCase());
        if (!Array.isArray(sheet.rows) || sheet.rows.length > 10000)
          throw new Error('Provide table rows.');
        for (const row of sheet.rows) {
          if (!Array.isArray(row) || row.length > 100)
            throw new Error('Tables support up to 100 columns.');
          cells += row.length;
          if (
            cells > 10000 ||
            row.some(
              (cell) => cell !== null && !['string', 'number', 'boolean'].includes(typeof cell),
            ) ||
            row.some((cell) => typeof cell === 'number' && !Number.isFinite(cell))
          )
            throw new Error(
              'Use at most 10,000 cells containing text, numbers, booleans, or null.',
            );
        }
      }
    }
    return {
      action,
      path: canonicalPath,
      format,
      content,
      sheets,
      parent,
      parentIdentity: identity(info),
      makeDirectory,
    };
  }
  preview(plan: FilePlan) {
    return JSON.stringify(
      {
        action: plan.action,
        path: plan.path,
        ...(plan.action === 'create'
          ? plan.sheets.length
            ? { sheets: plan.sheets }
            : { content: plan.content }
          : {}),
      },
      null,
      2,
    );
  }
  async execute(plan: FilePlan, signal: AbortSignal) {
    signal.throwIfAborted();
    if (
      (await realpath(plan.parent)) !== plan.parent ||
      identity(await stat(plan.parent)) !== plan.parentIdentity
    )
      throw new Error('The destination folder changed. Request permission again.');
    if (plan.action === 'read') {
      const handle = await open(
        plan.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > maxBytes)
          throw new Error('Choose a regular document up to 5 MB.');
        // Bound the actual read even if another process grows the file after stat.
        const buffer = Buffer.alloc(maxBytes + 1);
        let size = 0;
        while (size < buffer.length) {
          signal.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
          if (!bytesRead) break;
          size += bytesRead;
        }
        if (size > maxBytes) throw new Error('Document exceeds 5 MB.');
        const data = buffer.subarray(0, size);
        if (['pdf', 'docx'].includes(plan.format)) {
          const { readDocument } = await import('./read-document');
          return { path: plan.path, format: plan.format, content: await readDocument(data, plan.format, signal) };
        }
        if (plan.format !== 'xlsx') {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
          if (text.includes('\0')) throw new Error('Choose a UTF-8 text document.');
          if (text.length > maxText)
            throw new Error('Document exceeds the 500,000 character reading limit.');
          return { path: plan.path, format: plan.format, content: text };
        }
        const entries = new AdmZip(data).getEntries();
        if (
          entries.length > 2000 ||
          entries.reduce((sum, entry) => sum + entry.header.size, 0) > 20_000_000
        )
          throw new Error('Workbook exceeds the expanded size limit.');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(data as any);
        const sheets: { name: string; rows: unknown[][] }[] = [];
        let cells = 0;
        let textSize = 0;
        for (const sheet of workbook.worksheets) {
          const rows: unknown[][] = [];
          sheet.eachRow({ includeEmpty: true }, (row) => {
            if (row.number > 10000 || row.cellCount > 100)
              throw new Error('Workbook exceeds table limits.');
            const values: unknown[] = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              if (++cells > 10000) throw new Error('Workbook exceeds 10,000 cells.');
              // Preserve literal values, expose cached formula results without executing formulas or links.
              const value =
                cell.type === ExcelJS.ValueType.Formula
                  ? (cell.result ?? null)
                  : cell.value instanceof Date
                    ? cell.value.toISOString()
                    : typeof cell.value === 'object' && cell.value !== null
                      ? cell.text
                      : cell.value;
              textSize += JSON.stringify(value ?? null).length;
              if (textSize > maxText) throw new Error('Workbook text exceeds reading limits.');
              values.push(value ?? null);
            });
            rows.push(values);
          });
          sheets.push({ name: sheet.name, rows });
          if (sheets.length > 20) throw new Error('Workbook exceeds 20 sheets.');
        }
        return {
          path: plan.path,
          format: plan.format,
          sheets,
          note: 'Formula results are cached values; formulas are not recalculated.',
        };
      } finally {
        await handle.close();
      }
    }
    let data: Buffer;
    if (plan.format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Dextana';
      for (const table of plan.sheets) {
        const sheet = workbook.addWorksheet(table.name);
        sheet.addRows(table.rows);
        if (table.rows.length) {
          sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
          sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF386E50' },
          };
          sheet.views = [{ state: 'frozen', ySplit: 1 }];
          sheet.columns.forEach((column) => {
            column.width = 24;
          });
          if (table.rows[0].length)
            sheet.autoFilter = {
              from: { row: 1, column: 1 },
              to: { row: 1, column: table.rows[0].length },
            };
        }
      }
      data = Buffer.from(await workbook.xlsx.writeBuffer());
    } else if (plan.format === 'csv') {
      data = Buffer.from(
        plan.sheets[0].rows
          .map((row) =>
            row
              .map((cell) => {
                let value = String(cell ?? '');
                if (typeof cell === 'string' && /^[\s]*[=+\-@]/.test(value)) value = "'" + value;
                return '"' + value.replaceAll('"', '""') + '"';
              })
              .join(','),
          )
          .join('\r\n'),
        'utf8',
      );
    } else data = Buffer.from(plan.content, 'utf8');
    signal.throwIfAborted();
    if (plan.makeDirectory)
      await mkdir(dirname(plan.path), { mode: 0o700 }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
    if ((await realpath(dirname(plan.path))) !== dirname(plan.path))
      throw new Error('The destination folder changed. Request permission again.');
    let handle;
    try {
      handle = await open(
        plan.path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(
          'This file already exists. Choose a new filename; existing documents are never overwritten.',
        );
      throw error;
    }
    try {
      await handle.writeFile(data);
      await handle.sync();
    } catch (error) {
      await unlink(plan.path).catch(() => {});
      throw error;
    } finally {
      await handle.close();
    }
    return { path: plan.path, format: plan.format, created: true, bytes: data.length };
  }
}
