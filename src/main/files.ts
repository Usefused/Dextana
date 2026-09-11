import { constants } from 'node:fs';
import { open, mkdir, realpath, stat, lstat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import { snapshotText, snapshotFile, replaceText, replaceBytes, textRevision, type FileSnapshot, type TextSnapshot } from './file-edits';
import { prepareOfficeEdit, wordParagraphs, type DocumentChange } from './office-edits';

export const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
export const documentExtensions = ['txt', 'md', 'csv', 'xlsx', 'docx', 'pdf', ...imageExtensions];
const maxBytes = 5_000_000;
const maxText = 500_000;
type Sheet = { name: string; rows: (string | number | boolean | null)[][] };
export interface FilePlan {
  action: 'read' | 'create' | 'edit';
  before?: FileSnapshot | TextSnapshot;
  replacement?: Buffer;
  changes?: DocumentChange[];
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
    if (!['read', 'create', 'edit'].includes(String(args.action)))
      throw new Error('Choose read, create or edit.');
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
      (action !== 'create' ||
        basename(args.path) !== args.path ||
        args.path === '.' ||
        args.path === '..')
    )
      throw new Error('Reading and editing need an absolute path. Create with a filename or absolute path.');
    const path = isAbsolute(args.path) ? resolve(args.path) : join(this.outputDirectory, args.path);
    const format = extname(path).slice(1).toLowerCase();
    if (action === 'create' && !documentExtensions.includes(format))
      throw new Error(
        'Supported work files: Excel (.xlsx), Word (.docx), PDF, CSV, text, Markdown, PNG, JPEG, GIF and WebP images.',
      );
    if (action === 'create' && ['pdf', 'docx', ...imageExtensions].includes(format)) throw new Error('PDF, DOCX and images are supported for reading. Create an XLSX, CSV, TXT or Markdown document instead.');
    const officeEdit = action === 'edit' && ['docx', 'xlsx'].includes(format);
    if (action === 'edit' && ['pdf', ...imageExtensions].includes(format))
      throw new Error('Editing supports DOCX, XLSX and UTF-8 text files. PDF and image editing require a dedicated editor.');
    if (action === 'edit' && ((!officeEdit && typeof args.content !== 'string') || typeof args.expected_revision !== 'string' || !/^[a-f0-9]{64}$/.test(args.expected_revision)))
      throw new Error('Read the file first, then provide its expected_revision and the complete replacement content or edits_json.');
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
    if (action === 'edit' && (content.includes('\0') || !content.isWellFormed()))
      throw new Error('Replacement content must be valid UTF-8 text without null characters.');
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
    const before = action === 'edit' ? await (officeEdit ? snapshotFile(canonicalPath) : snapshotText(canonicalPath)) : undefined;
    if (before && before.revision !== args.expected_revision)
      throw new Error('The file changed since it was read. Read it again before proposing an edit.');
    if (before && 'content' in before && before.content === content) throw new Error('The proposed content is unchanged.');
    return {
      action,
      before,
      ...(officeEdit && before ? prepareOfficeEdit(before.data, format, args.edits_json) : {}),
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
        ...(plan.action === 'edit' ? plan.changes ? { changes: plan.changes, format: plan.format } : { before: (plan.before as TextSnapshot).content, content: plan.content } : {}),
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
    if (plan.action === 'edit') {
      if (!plan.before) throw new Error('Prepare the edit before requesting approval.');
      const result = plan.replacement
        ? await replaceBytes(plan.path, plan.before, plan.replacement, plan.parentIdentity, signal)
        : await replaceText(plan.path, plan.before, plan.content, plan.parentIdentity, signal);
      return { ...result, format: plan.format, ...(plan.format === 'xlsx' ? { note: 'Literal cells updated. Formulas are preserved and will recalculate in Excel.' } : {}) };
    }
    if (plan.action === 'read') {
      // Windows does not enforce O_NOFOLLOW. Check the directory entry and
      // bind the opened handle to that file before reading any document bytes.
      const entry = await lstat(plan.path);
      if (!entry.isFile()) throw new Error('Choose a regular document, not a symbolic link.');
      const handle = await open(
        plan.path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const info = await handle.stat();
        const current = await lstat(plan.path);
        if (!current.isFile() || identity(info) !== identity(entry) || identity(current) !== identity(entry))
          throw new Error('The document changed. Request permission again.');
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
        if (imageExtensions.includes(plan.format)) {
          const { rasterType } = await import('./images');
          const mediaType = rasterType(data);
          const expected = `image/${plan.format === 'jpg' ? 'jpeg' : plan.format}`;
          if (mediaType !== expected) throw new Error('The image format did not match its file extension.');
          return { path: plan.path, format: plan.format, image: { type: 'image', mediaType, data: data.toString('base64') } };
        }
        if (['pdf', 'docx'].includes(plan.format)) {
          const { readDocument } = await import('./read-document');
          return { path: plan.path, format: plan.format, content: await readDocument(data, plan.format, signal), revision: textRevision(data), ...(plan.format === 'docx' ? { paragraphs: wordParagraphs(data) } : {}) };
        }
        if (plan.format !== 'xlsx') {
          const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
          if (text.includes('\0')) throw new Error('Choose a UTF-8 text document.');
          if (text.length > maxText)
            throw new Error('Document exceeds the 500,000 character reading limit.');
          return { path: plan.path, format: plan.format, content: text, revision: textRevision(data) };
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
          revision: textRevision(data),
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
