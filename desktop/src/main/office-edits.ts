import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { posix } from 'node:path';

const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const excel = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relations = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export interface DocumentChange { target: string; before: string; after: string; beforeType?: string; afterType?: string }
const elements = (node: Document | Element, ns: string, name: string) => Array.from(node.getElementsByTagNameNS(ns, name));
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 500_000 && value.isWellFormed() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value);
function inRange(address: string, range: string) {
  const coordinates = (value: string) => {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(value.replaceAll('$', ''));
    if (!match) throw new Error('Unsupported worksheet range.');
    return [Array.from(match[1]).reduce((column, letter) => column * 26 + letter.charCodeAt(0) - 64, 0), Number(match[2])];
  };
  const [start, end = start] = range.split(':');
  const [x, y] = coordinates(address), [left, top] = coordinates(start), [right, bottom] = coordinates(end);
  return x >= left && x <= right && y >= top && y <= bottom;
}

function archive(data: Buffer) {
  const zip = new AdmZip(data);
  const entries = zip.getEntries();
  if (entries.length > 2000 || entries.reduce((size, entry) => size + entry.header.size, 0) > 20_000_000)
    throw new Error('Document exceeds the expanded size limit.');
  if (new Set(entries.map(entry => entry.entryName)).size !== entries.length)
    throw new Error('Duplicate document parts are not supported.');
  if (entries.some(entry => entry.entryName.startsWith('_xmlsignatures/')))
    throw new Error('Digitally signed documents require an editor that can renew their signatures.');
  return zip;
}
function xml(zip: AdmZip, path: string) {
  const part = zip.getEntry(path);
  if (!part) throw new Error(`Document part is missing: ${path}`);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(part.getData());
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('XML document entities are not supported.');
  const fail = () => { throw new Error('The document contains invalid XML.'); };
  return new DOMParser({ errorHandler: { warning: fail, error: fail, fatalError: fail } }).parseFromString(source, 'application/xml');
}
function save(zip: AdmZip, path: string, doc: Document) {
  zip.updateFile(path, Buffer.from(new XMLSerializer().serializeToString(doc)));
}
function edits(raw: unknown): Record<string, unknown>[] {
  if (typeof raw !== 'string' || raw.length > 500_000) throw new Error('Provide edits_json describing the document changes.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('edits_json must be valid JSON.'); }
  if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(edit => !edit || typeof edit !== 'object' || Array.isArray(edit)))
    throw new Error('Provide 1–100 targeted edits.');
  return value;
}

export function wordParagraphs(data: Buffer) {
  const doc = xml(archive(data), 'word/document.xml');
  return elements(doc, word, 'p').map((paragraph, i) => ({ paragraph: i + 1, text: elements(paragraph, word, 't').map(node => node.textContent ?? '').join('') }));
}
function editWord(zip: AdmZip, requested: Record<string, unknown>[]) {
  if (zip.getEntry('word/settings.xml') && elements(xml(zip, 'word/settings.xml'), word, 'documentProtection').some(node => ['1', 'true', 'on'].includes(node.getAttributeNS(word, 'enforcement') ?? '')))
    throw new Error('This Word document is protected. Remove protection in Word before editing it.');
  const doc = xml(zip, 'word/document.xml');
  const paragraphs = elements(doc, word, 'p');
  const used = new Set<number>();
  const changes: DocumentChange[] = [];
  for (const edit of requested) {
    if (!Number.isInteger(edit.paragraph) || !text(edit.find) || !edit.find || !text(edit.replace) || /[\r\n\t]/.test(edit.replace))
      throw new Error('Word edits need a paragraph number, exact find text, and replacement text without line breaks or tabs.');
    const index = Number(edit.paragraph) - 1;
    if (used.has(index)) throw new Error('Combine changes to the same paragraph into one edit.');
    used.add(index);
    const paragraph = paragraphs[index];
    if (!paragraph) throw new Error('The requested paragraph does not exist. Read the document again.');
    for (let parent = paragraph.parentNode; parent; parent = parent.parentNode) {
      if (parent.nodeType === 1 && (parent as Element).namespaceURI === word && ['sdt', 'ins', 'del', 'txbxContent'].includes((parent as Element).localName))
        throw new Error(`Paragraph ${edit.paragraph} is controlled or complex content. Edit it in Word instead.`);
    }
    // Do not modify text controlled by fields, revisions, links, drawings or nested paragraphs.
    if (['fldChar', 'instrText', 'fldSimple', 'ins', 'del', 'hyperlink', 'drawing', 'object', 'tab', 'br', 'sdt', 'p'].some(name => elements(paragraph, word, name).length))
      throw new Error(`Paragraph ${edit.paragraph} has complex content. Edit it in Word instead.`);
    const nodes = elements(paragraph, word, 't');
    const before = nodes.map(node => node.textContent ?? '').join('');
    const start = before.indexOf(edit.find);
    if (start < 0 || before.indexOf(edit.find, start + 1) >= 0)
      throw new Error(`Find text must match exactly once in paragraph ${edit.paragraph}.`);
    if (edit.find === edit.replace) throw new Error('The proposed content is unchanged.');
    const end = start + edit.find.length;
    let position = 0;
    let inserted = false;
    for (const node of nodes) {
      const value = node.textContent ?? '';
      const next = position + value.length;
      if (next > start && position < end) {
        const prefix = value.slice(0, Math.max(0, start - position));
        const suffix = value.slice(Math.max(0, end - position));
        node.textContent = prefix + (inserted ? '' : edit.replace) + suffix;
        node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        inserted = true;
      }
      position = next;
    }
    changes.push({ target: `Paragraph ${edit.paragraph}`, before, after: before.slice(0, start) + edit.replace + before.slice(end) });
  }
  save(zip, 'word/document.xml', doc);
  return changes;
}
function editExcel(zip: AdmZip, requested: Record<string, unknown>[]) {
  const workbook = xml(zip, 'xl/workbook.xml');
  const relationships = xml(zip, 'xl/_rels/workbook.xml.rels');
  const shared = zip.getEntry('xl/sharedStrings.xml') ? elements(xml(zip, 'xl/sharedStrings.xml'), excel, 'si').map(node => elements(node, excel, 't').map(t => t.textContent ?? '').join('')) : [];
  const documents = new Map<string, Document>();
  const used = new Set<string>();
  const changes: DocumentChange[] = [];
  for (const edit of requested) {
    if (typeof edit.sheet !== 'string' || typeof edit.cell !== 'string' || !/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(edit.cell) ||
        !(edit.value === null || text(edit.value) || typeof edit.value === 'boolean' || (typeof edit.value === 'number' && Number.isFinite(edit.value))))
      throw new Error('Excel edits need a sheet name, existing cell address (for example B2), and a literal value or null.');
    const sheet = elements(workbook, excel, 'sheet').find(node => node.getAttribute('name') === edit.sheet);
    if (!sheet) throw new Error(`Unknown worksheet: ${edit.sheet}`);
    const id = sheet.getAttributeNS(relations, 'id');
    const relation = Array.from(relationships.documentElement.childNodes).find(node => node.nodeType === 1 && (node as Element).getAttribute('Id') === id) as Element | undefined;
    const target = relation?.getAttribute('Target');
    if (!target || relation?.getAttribute('TargetMode') === 'External') throw new Error('The worksheet relationship is unsupported.');
    const path = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join('xl', target));
    if (!path.startsWith('xl/worksheets/') || !path.endsWith('.xml')) throw new Error('The worksheet path is unsupported.');
    const doc = documents.get(path) ?? xml(zip, path);
    documents.set(path, doc);
    if (elements(doc, excel, 'sheetProtection').length) throw new Error(`Worksheet ${edit.sheet} is protected.`);
    const key = `${path}:${edit.cell}`;
    if (used.has(key)) throw new Error('Each cell can be edited only once per request.');
    used.add(key);
    const cell = elements(doc, excel, 'c').find(node => node.getAttribute('r') === edit.cell);
    if (!cell) throw new Error(`Cell ${edit.sheet}!${edit.cell} does not exist. This editor updates existing cells.`);
    if (elements(cell, excel, 'f').length) throw new Error(`Cell ${edit.sheet}!${edit.cell} is a formula. This editor changes literal values and preserves formulas.`);
    if (elements(doc, excel, 'f').some(node => node.getAttribute('ref') && inRange(edit.cell as string, node.getAttribute('ref')!)))
      throw new Error(`Cell ${edit.sheet}!${edit.cell} belongs to a formula range. Edit it in Excel instead.`);
    if (elements(doc, excel, 'mergeCell').some(node => node.getAttribute('ref') && inRange(edit.cell as string, node.getAttribute('ref')!) && node.getAttribute('ref')!.split(':')[0] !== edit.cell))
      throw new Error('Update the top-left cell of a merged range.');
    if (cell.hasAttribute('cm') || cell.hasAttribute('vm') || elements(cell, excel, 'extLst').length)
      throw new Error('Rich data cells require editing in Excel.');
    const type = cell.getAttribute('t') ?? '';
    const raw = elements(cell, excel, 'v')[0]?.textContent ?? '';
    const before = type === 's' ? shared[Number(raw)] ?? '' : type === 'inlineStr' ? elements(cell, excel, 't').map(node => node.textContent ?? '').join('') : type === 'b' ? (raw === '1' ? 'true' : 'false') : raw;
    const after = edit.value === null ? '(Empty cell)' : String(edit.value);
    if (before === after && ((type === 's' || type === 'inlineStr') === (typeof edit.value === 'string'))) throw new Error('The proposed cell value is unchanged.');
    for (const child of Array.from(cell.childNodes)) {
      if (child.nodeType === 1 && ['v', 'is'].includes((child as Element).localName)) cell.removeChild(child);
    }
    cell.removeAttribute('t');
    const make = (name: string) => doc.createElementNS(excel, cell.prefix ? `${cell.prefix}:${name}` : name);
    if (typeof edit.value === 'string') {
      cell.setAttribute('t', 'inlineStr');
      const inline = make('is'); const value = make('t');
      value.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      value.appendChild(doc.createTextNode(edit.value)); inline.appendChild(value); cell.appendChild(inline);
    } else if (edit.value !== null) {
      cell.setAttribute('t', typeof edit.value === 'boolean' ? 'b' : 'n');
      const value = make('v'); value.appendChild(doc.createTextNode(typeof edit.value === 'boolean' ? (edit.value ? '1' : '0') : String(edit.value))); cell.appendChild(value);
    }
    changes.push({ target: `${edit.sheet}!${edit.cell}`, before: before || '(Empty cell)', after,
      beforeType: ['s', 'inlineStr', 'str'].includes(type) ? 'Text' : type === 'b' ? 'Boolean' : type === 'd' ? 'Date' : type === 'e' ? 'Error' : raw ? 'Number' : 'Empty',
      afterType: edit.value === null ? 'Empty' : typeof edit.value === 'string' ? 'Text' : typeof edit.value === 'boolean' ? 'Boolean' : 'Number' });
  }
  // Excel recalculates dependent formulas when opened; Dextana does not execute them.
  let calculation = elements(workbook, excel, 'calcPr')[0];
  if (!calculation) {
    calculation = workbook.createElementNS(excel, workbook.documentElement.prefix ? `${workbook.documentElement.prefix}:calcPr` : 'calcPr');
    const following = Array.from(workbook.documentElement.childNodes).find(node => node.nodeType === 1 && ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'].includes((node as Element).localName));
    workbook.documentElement.insertBefore(calculation, following ?? null);
  }
  calculation.setAttribute('fullCalcOnLoad', '1'); calculation.setAttribute('forceFullCalc', '1');
  calculation.setAttribute('calcMode', 'auto');
  save(zip, 'xl/workbook.xml', workbook);
  for (const [path, doc] of documents) save(zip, path, doc);
  return changes;
}
export function prepareOfficeEdit(data: Buffer, format: string, raw: unknown) {
  const requested = edits(raw);
  const zip = archive(data);
  const changes = format === 'docx' ? editWord(zip, requested) : editExcel(zip, requested);
  if (JSON.stringify(changes).length > 1_000_000) throw new Error('The edit preview is too large. Propose fewer changes at a time.');
  const replacement = zip.toBuffer();
  if (replacement.length > 5_000_000) throw new Error('The edited document exceeds 5 MB.');
  return { replacement, changes };
}
