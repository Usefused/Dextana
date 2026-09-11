import { expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { mkdtemp, writeFile, readFile, rm, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { WorkFiles } from '../../src/main/files';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, open: vi.fn(actual.open) };
});

const signal = () => new AbortController().signal;
test('image reads return typed media and reject mismatched formats and image creation', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'reference.png');
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=';
    await writeFile(path, Buffer.from(png, 'base64'));
    const result = await files.execute(await files.prepare({ action: 'read', path }), signal());
    expect('image' in result && result.image).toEqual({
      type: 'image',
      mediaType: 'image/png',
      data: png,
    });
    await writeFile(path, '<svg/>');
    await expect(
      files.execute(await files.prepare({ action: 'read', path }), signal()),
    ).rejects.toThrow('format');
    await expect(files.prepare({ action: 'create', path: 'new.png' })).rejects.toThrow(
      'supported for reading',
    );
  }));
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
test('rejects a document replaced between checking its entry and opening the handle', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'brief.txt');
    await writeFile(path, 'Approved document');
    const plan = await files.prepare({ action: 'read', path });
    const { open } = await vi.importActual<typeof fs>('node:fs/promises');
    const replacement = vi.mocked(fs.open).mockImplementationOnce(async (...args) => {
      await rename(path, join(directory, 'original.txt'));
      await writeFile(path, 'Unapproved replacement');
      return open(...args);
    });
    try {
      await expect(files.execute(plan, signal())).rejects.toThrow('document changed');
    } finally {
      replacement.mockImplementation(open);
    }
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

// Loading the real document parsers can exceed five seconds on a cold Windows runner.
test('reads text from attached Word and PDF documents', async () => {
  const { wordDocument, pdfDocument } = await import('../helpers/documents');
  await fixture(async (files, directory) => {
    for (const [extension, data] of [
      ['docx', wordDocument('Word reference')],
      ['pdf', pdfDocument('PDF reference')],
    ] as const) {
      const path = join(directory, `Reference.${extension}`);
      await writeFile(path, data);
      const result = await files.execute(await files.prepare({ action: 'read', path }), signal());
      expect(result).toMatchObject({
        format: extension,
        content: expect.stringContaining(extension === 'docx' ? 'Word reference' : 'PDF reference'),
      });
    }
    const path = join(directory, 'Scanned.pdf');
    await writeFile(path, pdfDocument(''));
    await expect(
      files.execute(await files.prepare({ action: 'read', path }), signal()),
    ).rejects.toThrow('no readable text layer');
  });
}, 15_000);

test('edits bind the full review to the read revision and preserve UTF-8 BOM and CRLF', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'Notes.md');
    const original = '\ufeff# Notes\r\nOriginal\r\n';
    const replacement = '\ufeff# Notes\r\nUpdated\r\n';
    await writeFile(path, original);
    const read = await files.execute(await files.prepare({ action: 'read', path }), signal());
    expect('content' in read && read.content).toBe(original);
    const plan = await files.prepare({
      action: 'edit',
      path,
      expected_revision: 'revision' in read ? read.revision : '',
      content: replacement,
    });
    expect(JSON.parse(files.preview(plan))).toEqual({
      action: 'edit',
      path: await fs.realpath(path),
      before: original,
      content: replacement,
    });
    expect(await readFile(path, 'utf8')).toBe(original);
    expect(await files.execute(plan, signal())).toMatchObject({
      edited: true,
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(await readFile(path, 'utf8')).toBe(replacement);
    await expect(files.execute(plan, signal())).rejects.toThrow('file changed');
  }));

test('stale revisions, cancellation, concurrent edits and replaced files preserve the latest document', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'Notes.txt');
    await writeFile(path, 'Original');
    const read = await files.execute(await files.prepare({ action: 'read', path }), signal());
    const args = {
      action: 'edit',
      path,
      expected_revision: 'revision' in read ? read.revision : '',
      content: 'Proposed',
    };
    const first = await files.prepare(args);
    const second = await files.prepare({ ...args, content: 'Other proposed' });
    const abort = new AbortController();
    abort.abort();
    await expect(files.execute(first, abort.signal)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('Original');
    const outcomes = await Promise.allSettled([
      files.execute(first, signal()),
      files.execute(second, signal()),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await readFile(path, 'utf8')).toBe(
      outcomes[0].status === 'fulfilled' ? 'Proposed' : 'Other proposed',
    );
    await expect(files.prepare(args)).rejects.toThrow('changed since');
    const current = await files.execute(await files.prepare({ action: 'read', path }), signal());
    const plan = await files.prepare({
      ...args,
      content: 'Final',
      expected_revision: 'revision' in current ? current.revision : '',
    });
    await rename(path, join(directory, 'Moved.txt'));
    await writeFile(path, 'External replacement');
    await expect(files.execute(plan, signal())).rejects.toThrow('file changed');
    expect(await readFile(path, 'utf8')).toBe('External replacement');
    expect((await fs.readdir(directory)).some((name) => name.startsWith('.dextana-edit-'))).toBe(
      false,
    );
  }));

test('editing rejects missing content, binary formats, links, and unchanged proposals; explicit empty content is allowed', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'Notes.csv');
    await writeFile(path, 'Name,Value\r\nAlice,1\r\n');
    const read = await files.execute(await files.prepare({ action: 'read', path }), signal());
    const args = {
      action: 'edit',
      path,
      expected_revision: 'revision' in read ? read.revision : '',
    };
    await expect(files.prepare(args)).rejects.toThrow('complete replacement');
    await expect(files.prepare({ ...args, content: '\0' })).rejects.toThrow('valid UTF-8');
    await expect(files.prepare({ ...args, content: '\ud800' })).rejects.toThrow('valid UTF-8');
    await expect(files.prepare({ ...args, content: 'Name,Value\r\nAlice,1\r\n' })).rejects.toThrow(
      'unchanged',
    );
    await expect(
      files.prepare({ ...args, path: join(directory, 'Notes.pdf'), content: '' }),
    ).rejects.toThrow('Editing supports');
    await symlink(path, join(directory, 'Link.csv'));
    await expect(
      files.prepare({ ...args, path: join(directory, 'Link.csv'), content: '' }),
    ).rejects.toThrow('link');
    await files.execute(await files.prepare({ ...args, content: '' }), signal());
    expect(await readFile(path, 'utf8')).toBe('');
  }));

test('a failed replacement write leaves the original intact and removes the temporary file', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'Notes.txt');
    await writeFile(path, 'Original');
    const read = await files.execute(await files.prepare({ action: 'read', path }), signal());
    const plan = await files.prepare({
      action: 'edit',
      path,
      expected_revision: 'revision' in read ? read.revision : '',
      content: 'Replacement',
    });
    const { open } = await vi.importActual<typeof fs>('node:fs/promises');
    vi.mocked(fs.open).mockImplementation(async (...args) => {
      const handle = await open(...args);
      if (String(args[0]).includes('.dextana-edit-')) {
        vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(new Error('Disk full'));
      }
      return handle;
    });
    try {
      await expect(files.execute(plan, signal())).rejects.toThrow('Disk full');
      expect(await readFile(path, 'utf8')).toBe('Original');
      expect(await fs.readdir(directory)).toEqual(['Notes.txt']);
    } finally {
      vi.mocked(fs.open).mockImplementation(open);
    }
  }));
