import AdmZip from 'adm-zip';
const maxText = 500_000;
export async function readDocument(
  data: Buffer,
  format: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (format === 'docx') {
    const entries = new AdmZip(data).getEntries();
    if (
      entries.length > 2000 ||
      entries.reduce((sum, entry) => sum + entry.header.size, 0) > 20_000_000
    )
      throw new Error('Document exceeds the expanded size limit.');
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: data });
    signal.throwIfAborted();
    if (value.length > maxText) throw new Error('Document exceeds the reading limit.');
    return value;
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
  });
  const abort = () => {
    void task.destroy();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error('PDF exceeds the 200-page reading limit.');
    let text = '';
    for (let index = 1; index <= pdf.numPages; index++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      text +=
        content.items
          .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
          .join('') + '\n\n';
      page.cleanup();
      if (text.length > maxText) throw new Error('PDF exceeds the reading limit.');
    }
    if (!text.trim())
      throw new Error(
        'This PDF has no readable text layer. Supply an OCR version or a text document.',
      );
    return text.trim();
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}
