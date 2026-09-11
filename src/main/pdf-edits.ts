import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  StandardFonts,
  type PDFField,
} from 'pdf-lib';
import type { DocumentChange } from './office-edits';

export interface PdfFormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'option-list' | 'button' | 'signature';
  value: string | boolean | string[] | null;
  options?: string[];
  readOnly: boolean;
  required: boolean;
}

type PdfFormValue = string | boolean | string[] | null;
type RequestedEdit = { field: string; value: PdfFormValue };

const validText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 100_000 &&
  value.isWellFormed() &&
  !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value);
const validFieldName = (value: unknown): value is string =>
  validText(value) && value.length <= 1_000 && !/[\x00-\x1f]/.test(value);

function parseEdits(raw: unknown): RequestedEdit[] {
  if (typeof raw !== 'string' || raw.length > 500_000)
    throw new Error('Provide edits_json describing the PDF form changes.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('edits_json must be valid JSON.');
  }
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 100 ||
    value.some(
      (edit) =>
        !edit ||
        typeof edit !== 'object' ||
        Array.isArray(edit) ||
        !validFieldName((edit as Record<string, unknown>).field) ||
        !(edit as Record<string, unknown>).field ||
        !Object.hasOwn(edit, 'value'),
    )
  )
    throw new Error('PDF edits need 1–100 objects with an exact field name and value.');
  const edits = value as RequestedEdit[];
  const used = new Set<string>();
  for (const edit of edits) {
    if (used.has(edit.field))
      throw new Error('Each PDF form field can be edited only once per request.');
    used.add(edit.field);
    if (!(
      edit.value === null ||
      typeof edit.value === 'boolean' ||
      validText(edit.value) ||
      (Array.isArray(edit.value) && edit.value.length <= 100 && edit.value.every(validText))
    ))
      throw new Error('PDF field values must be text, a boolean, a text array, or null.');
  }
  return edits;
}

async function load(data: Buffer) {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(data, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (error) {
    if (/encrypted/i.test((error as Error).message))
      throw new Error(
        'Encrypted PDFs must be unlocked before their form fields can be read or filled.',
      );
    throw new Error(`The PDF form could not be read: ${(error as Error).message}`);
  }
  if (document.isEncrypted)
    throw new Error(
      'Encrypted PDFs must be unlocked before their form fields can be read or filled.',
    );
  return document;
}

function fieldValue(field: PDFField): PdfFormValue {
  if (field instanceof PDFTextField)
    return field.isRichFormatted() ? null : (field.getText() ?? null);
  if (field instanceof PDFCheckBox) return field.isChecked();
  if (field instanceof PDFRadioGroup) return field.getSelected() ?? null;
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) return field.getSelected();
  return null;
}

function describe(field: PDFField): PdfFormField {
  const common = {
    name: field.getName(),
    value: fieldValue(field),
    readOnly: field.isReadOnly(),
    required: field.isRequired(),
  };
  if (field instanceof PDFTextField) return { ...common, type: 'text' };
  if (field instanceof PDFCheckBox) return { ...common, type: 'checkbox' };
  if (field instanceof PDFRadioGroup)
    return { ...common, type: 'radio', options: field.getOptions() };
  if (field instanceof PDFDropdown)
    return { ...common, type: 'dropdown', options: field.getOptions() };
  if (field instanceof PDFOptionList)
    return { ...common, type: 'option-list', options: field.getOptions() };
  if (field instanceof PDFButton) return { ...common, type: 'button' };
  if (field instanceof PDFSignature) return { ...common, type: 'signature' };
  throw new Error(`Unsupported PDF form field: ${field.getName()}`);
}

function hasXfa(document: PDFDocument) {
  return Boolean(document.catalog.AcroForm()?.has(PDFName.of('XFA')));
}

function fields(document: PDFDocument) {
  if (hasXfa(document))
    throw new Error('XFA forms require a compatible PDF editor and cannot be safely filled here.');
  const form = document.getForm();
  let result: PDFField[];
  try {
    result = form.getFields();
  } catch (error) {
    throw new Error(`The PDF form fields could not be read: ${(error as Error).message}`);
  }
  if (result.length > 500) throw new Error('PDF forms are limited to 500 fields.');
  const names = new Set<string>();
  for (const field of result) {
    const name = field.getName();
    if (!name || names.has(name))
      throw new Error(
        'PDF forms with missing or duplicate field names require a dedicated editor.',
      );
    names.add(name);
  }
  return result;
}

function assertUnsigned(document: PDFDocument, formFields: PDFField[], data: Buffer) {
  const signatureFlags = document.catalog
    .AcroForm()
    ?.lookupMaybe(PDFName.of('SigFlags'), PDFNumber)
    ?.asNumber();
  const hasSignatureValue = formFields.some(
    (field) => field instanceof PDFSignature && field.acroField.V() !== undefined,
  );
  const hasDocumentPermissions = document.catalog.has(PDFName.of('Perms'));
  const hasByteRange = /\/ByteRange\s*\[/.test(data.toString('latin1'));
  if (signatureFlags || hasSignatureValue || hasDocumentPermissions || hasByteRange)
    throw new Error(
      'Digitally signed PDFs cannot be changed because editing would invalidate the signature.',
    );
}

function display(value: PdfFormValue) {
  if (value === null || (Array.isArray(value) && !value.length)) return '(Empty)';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function typeName(field: PdfFormField) {
  return field.type
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function setValue(field: PDFField, value: PdfFormValue) {
  if (field.isReadOnly()) throw new Error(`PDF field “${field.getName()}” is read-only.`);
  if (field instanceof PDFTextField) {
    if (!(value === null || validText(value)))
      throw new Error(`PDF text field “${field.getName()}” needs a text value or null.`);
    if (field.isRichFormatted() || field.isFileSelector())
      throw new Error(`PDF text field “${field.getName()}” requires a compatible PDF editor.`);
    field.setText(value ?? undefined);
    return;
  }
  if (field instanceof PDFCheckBox) {
    if (!(value === null || typeof value === 'boolean'))
      throw new Error(`PDF checkbox “${field.getName()}” needs true, false, or null.`);
    value ? field.check() : field.uncheck();
    return;
  }
  if (field instanceof PDFRadioGroup) {
    if (!(value === null || validText(value)))
      throw new Error(`PDF radio group “${field.getName()}” needs one option or null.`);
    if (value === null) field.clear();
    else if (!field.getOptions().includes(value))
      throw new Error(`Unknown option for PDF field “${field.getName()}”: ${value}`);
    else field.select(value);
    return;
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    if (!(value === null || validText(value) || (Array.isArray(value) && value.every(validText))))
      throw new Error(
        `PDF choice field “${field.getName()}” needs option text, a text array, or null.`,
      );
    if (value === null) field.clear();
    else {
      const selected = Array.isArray(value) ? value : [value];
      if (!selected.length || selected.some((option) => !field.getOptions().includes(option)))
        throw new Error(`Choose existing options for PDF field “${field.getName()}”.`);
      if (selected.length > 1 && !field.isMultiselect())
        throw new Error(`PDF field “${field.getName()}” allows only one selection.`);
      field.select(value);
    }
    return;
  }
  throw new Error(`PDF field “${field.getName()}” cannot be filled.`);
}

function sameValue(actual: PdfFormValue, expected: PdfFormValue) {
  return Array.isArray(actual) && Array.isArray(expected)
    ? actual.length === expected.length && actual.every((value, index) => value === expected[index])
    : actual === expected || (expected === null && Array.isArray(actual) && !actual.length);
}

export async function inspectPdfForm(
  data: Buffer,
): Promise<{ fields: PdfFormField[]; xfa: boolean }> {
  const document = await load(data);
  if (hasXfa(document)) return { fields: [], xfa: true };
  const formFields = fields(document).map(describe);
  if (JSON.stringify(formFields).length > 500_000)
    throw new Error('PDF form metadata exceeds the reading limit.');
  return { fields: formFields, xfa: false };
}

export async function preparePdfEdit(data: Buffer, raw: unknown) {
  const requested = parseEdits(raw);
  const document = await load(data);
  const formFields = fields(document);
  if (!formFields.length) throw new Error('This PDF does not contain fillable form fields.');
  assertUnsigned(document, formFields, data);
  const byName = new Map(formFields.map((field) => [field.getName(), field]));
  const changes: DocumentChange[] = [];
  const expectedValues = new Map<string, PdfFormValue>();
  const changedFields: PDFField[] = [];
  for (const edit of requested) {
    const field = byName.get(edit.field);
    if (!field) throw new Error(`Unknown PDF form field: ${edit.field}`);
    const before = fieldValue(field);
    setValue(field, edit.value);
    const after = fieldValue(field);
    if (sameValue(before, after)) throw new Error(`PDF field “${edit.field}” is unchanged.`);
    expectedValues.set(edit.field, after);
    changedFields.push(field);
    const description = describe(field);
    changes.push({
      target: `PDF field “${edit.field}”`,
      before: display(before),
      after: display(after),
      beforeType: typeName(description),
      afterType: typeName(description),
    });
  }
  if (JSON.stringify(changes).length > 1_000_000)
    throw new Error('The edit preview is too large. Propose fewer changes at a time.');
  try {
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (const field of changedFields) {
      if (
        field instanceof PDFTextField ||
        field instanceof PDFDropdown ||
        field instanceof PDFOptionList
      )
        field.updateAppearances(font);
      else if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup)
        field.updateAppearances();
    }
  } catch (error) {
    throw new Error(
      `The requested text cannot be rendered in this PDF form: ${(error as Error).message}`,
    );
  }
  const replacement = Buffer.from(
    await document.save({
      addDefaultPage: false,
      updateFieldAppearances: false,
      useObjectStreams: false,
    }),
  );
  if (replacement.length > 5_000_000) throw new Error('The edited PDF exceeds 5 MB.');

  const verified = new Map(
    fields(await load(replacement)).map((field) => [field.getName(), field]),
  );
  for (const edit of requested) {
    const field = verified.get(edit.field);
    if (!field || !sameValue(fieldValue(field), expectedValues.get(edit.field) ?? null))
      throw new Error(`Could not verify the saved value for PDF field “${edit.field}”.`);
  }
  return { replacement, changes };
}
