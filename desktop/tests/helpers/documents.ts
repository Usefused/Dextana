import AdmZip from 'adm-zip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
export function wordDocument(text: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  zip.addFile(
    'word/document.xml',
    Buffer.from(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  );
  return zip.toBuffer();
}
export function pdfDocument(text: string): Buffer {
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export async function pdfFormDocument(pageText = true): Promise<Buffer> {
  const document = await PDFDocument.create({ updateMetadata: false });
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  if (pageText) page.drawText('Application form', { x: 50, y: 745, size: 18, font });
  const form = document.getForm();
  const name = form.createTextField('Applicant name');
  name.setText('Original applicant');
  name.addToPage(page, { x: 50, y: 680, width: 240, height: 24, font });
  const consent = form.createCheckBox('Consent');
  consent.addToPage(page, { x: 50, y: 630, width: 18, height: 18 });
  const delivery = form.createRadioGroup('Delivery');
  delivery.addOptionToPage('Email', page, { x: 50, y: 580, width: 18, height: 18 });
  delivery.addOptionToPage('Post', page, { x: 100, y: 580, width: 18, height: 18 });
  delivery.select('Email');
  const country = form.createDropdown('Country');
  country.setOptions(['France', 'United Kingdom', 'United States']);
  country.select('France');
  country.addToPage(page, { x: 50, y: 525, width: 180, height: 24, font });
  const interests = form.createOptionList('Interests');
  interests.setOptions(['Design', 'Engineering', 'Research']);
  interests.enableMultiselect();
  interests.select(['Design']);
  interests.addToPage(page, { x: 50, y: 400, width: 180, height: 90, font });
  form.updateFieldAppearances(font);
  return Buffer.from(
    await document.save({ updateFieldAppearances: false, useObjectStreams: false }),
  );
}
