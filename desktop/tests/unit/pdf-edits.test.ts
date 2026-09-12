import { expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { WorkFiles } from '../../src/main/files';
import { preparePdfEdit } from '../../src/main/pdf-edits';
import { pdfFormDocument } from '../helpers/documents';

const signal = new AbortController().signal;
async function fixture(run: (files: WorkFiles, directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-pdf-edit-'));
  try {
    await run(new WorkFiles(directory), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  'PDF form reads expose fields and reviewed edits preserve the interactive form',
  () =>
    fixture(async (files, directory) => {
      const path = join(directory, 'Application.pdf');
      await writeFile(path, await pdfFormDocument());
      const read = await files.execute(await files.prepare({ action: 'read', path }), signal);
      expect(read).toMatchObject({
        format: 'pdf',
        content: expect.stringContaining('Application form'),
        revision: expect.stringMatching(/^[a-f0-9]{64}$/),
        form_fields: expect.arrayContaining([
          {
            name: 'Applicant name',
            type: 'text',
            value: 'Original applicant',
            readOnly: false,
            required: false,
          },
          {
            name: 'Country',
            type: 'dropdown',
            value: ['France'],
            options: ['France', 'United Kingdom', 'United States'],
            readOnly: false,
            required: false,
          },
        ]),
      });
      const plan = await files.prepare({
        action: 'edit',
        path,
        expected_revision: 'revision' in read ? read.revision : '',
        edits_json: JSON.stringify([
          { field: 'Applicant name', value: 'Alex Morgan' },
          { field: 'Consent', value: true },
          { field: 'Delivery', value: 'Post' },
          { field: 'Country', value: 'United Kingdom' },
          { field: 'Interests', value: ['Engineering', 'Research'] },
        ]),
      });
      expect(JSON.parse(files.preview(plan)).changes).toEqual([
        {
          target: 'PDF field “Applicant name”',
          before: 'Original applicant',
          after: 'Alex Morgan',
          beforeType: 'Text',
          afterType: 'Text',
        },
        {
          target: 'PDF field “Consent”',
          before: 'false',
          after: 'true',
          beforeType: 'Checkbox',
          afterType: 'Checkbox',
        },
        {
          target: 'PDF field “Delivery”',
          before: 'Email',
          after: 'Post',
          beforeType: 'Radio',
          afterType: 'Radio',
        },
        {
          target: 'PDF field “Country”',
          before: 'France',
          after: 'United Kingdom',
          beforeType: 'Dropdown',
          afterType: 'Dropdown',
        },
        {
          target: 'PDF field “Interests”',
          before: 'Design',
          after: 'Engineering, Research',
          beforeType: 'Option List',
          afterType: 'Option List',
        },
      ]);
      const original = await readFile(path);
      expect(original).not.toEqual(plan.replacement);
      await expect(files.execute(plan, signal)).resolves.toMatchObject({
        edited: true,
        format: 'pdf',
        note: 'PDF form fields updated. The form remains interactive.',
      });
      const edited = await PDFDocument.load(await readFile(path));
      const form = edited.getForm();
      expect(form.getTextField('Applicant name').getText()).toBe('Alex Morgan');
      expect(form.getCheckBox('Consent').isChecked()).toBe(true);
      expect(form.getRadioGroup('Delivery').getSelected()).toBe('Post');
      expect(form.getDropdown('Country').getSelected()).toEqual(['United Kingdom']);
      expect(form.getOptionList('Interests').getSelected()).toEqual(['Engineering', 'Research']);
      const widget = form.getTextField('Applicant name').acroField.getWidgets()[0];
      expect(widget).toBeDefined();
      expect(widget!.getAppearances()?.normal).toBeTruthy();
    }),
  15_000,
);

test('PDF form editing rejects invalid targets, types, choices, read-only fields and signed files', async () => {
  const data = await pdfFormDocument();
  await expect(
    preparePdfEdit(data, JSON.stringify([{ field: 'Missing', value: 'Value' }])),
  ).rejects.toThrow('Unknown PDF form field');
  await expect(
    preparePdfEdit(data, JSON.stringify([{ field: 'Consent', value: 'yes' }])),
  ).rejects.toThrow('needs true, false');
  await expect(
    preparePdfEdit(data, JSON.stringify([{ field: 'Country', value: 'Atlantis' }])),
  ).rejects.toThrow('existing options');

  const readOnly = await PDFDocument.load(data);
  readOnly.getForm().getTextField('Applicant name').enableReadOnly();
  await expect(
    preparePdfEdit(
      Buffer.from(await readOnly.save()),
      JSON.stringify([{ field: 'Applicant name', value: 'New' }]),
    ),
  ).rejects.toThrow('read-only');

  const signed = await PDFDocument.load(data);
  signed.catalog.AcroForm()!.set(PDFName.of('SigFlags'), PDFNumber.of(1));
  await expect(
    preparePdfEdit(
      Buffer.from(await signed.save()),
      JSON.stringify([{ field: 'Applicant name', value: 'New' }]),
    ),
  ).rejects.toThrow('Digitally signed');

  const xfa = await PDFDocument.load(data);
  xfa.catalog.AcroForm()!.set(PDFName.of('XFA'), PDFString.of('unsupported'));
  await expect(
    preparePdfEdit(
      Buffer.from(await xfa.save()),
      JSON.stringify([{ field: 'Applicant name', value: 'New' }]),
    ),
  ).rejects.toThrow('XFA forms');
});

test('fillable PDFs without a page-text layer still expose their form inventory', () =>
  fixture(async (files, directory) => {
    const path = join(directory, 'Fields-only.pdf');
    await writeFile(path, await pdfFormDocument(false));
    const result = await files.execute(await files.prepare({ action: 'read', path }), signal);
    expect(result).toMatchObject({
      content: '',
      note: expect.stringContaining('no readable page-text layer'),
      form_fields: expect.arrayContaining([
        expect.objectContaining({ name: 'Applicant name', value: 'Original applicant' }),
      ]),
    });
  }));
