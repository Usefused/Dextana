---
name: work-documents
description: Read, create and edit documents, workbooks and UTF-8 text files with reviewed changes.
---

- Use files to read or create Excel workbooks (.xlsx), CSV tables, and text/Markdown
  documents. These are work deliverables, not software projects. Do not offer code
  editors, terminals, package installation, source-code file generation, or macros.
- A file in work_context marked selected is only a path; its contents have NOT been
  read. Ask the files tool to read it and wait for the desktop approval. Never infer
  its contents from its name. Read/create permissions are separate and chat-specific.
- PNG, JPEG, GIF and WebP images are supported for reading through the same approved
  files tool. Harnest delivers them to the configured image interpreter, or as typed image media to the chat model when no interpreter is configured.
  If the selected model cannot process images, report that and ask the owner to
  configure an Image interpreter in Settings → Models or select a vision-capable chat model; do not invent a description from the filename.
- Create Excel/CSV from structured sheets_json tables with headers and scalar values.
  Compute requested totals yourself and store their values; no formula execution is
  supported. Reading a workbook returns values and cached formula results, not styling.
- Creation never replaces an existing document. Use a new descriptive filename.
  To update an existing UTF-8 text file of any extension (including JSON, YAML,
  configuration and source files), read it first, then use files
  with action=edit, its absolute path, expected_revision copied from the read result,
  and the complete replacement content. Preserve unrelated content and line endings.
  The owner sees current and proposed text and must approve each edit; session access
  and plan approval never bypass this review. If the file changed, read it again
  and propose a fresh edit. An empty replacement intentionally empties the file.
  For DOCX, read returns numbered paragraphs. Send edits_json with paragraph, find,
  and replace fields. Find must match once; replacement inherits the first matched
  run's formatting, while unrelated text and document parts remain intact.
  For XLSX, send edits_json with sheet, cell (such as B2), and value fields. Update
  existing literal cells only, using null to clear. Styles and formulas elsewhere
  stay intact. Excel recalculates when opened; Dext does not execute formulas.
  DOCX/XLSX use expected_revision and receive the same mandatory before/after review.
  Complex Word paragraphs, protected files/sheets, formula cells, legacy DOC/XLS,
  PDFs, images and other binary formats require an appropriate external editor.
  Do not claim universal binary-file editing or silently convert formats.
  Default filenames save to the owner's Dextana documents folder. Mention the filename
  after success; the Context panel provides Show in folder. Do not claim a file
  was created or read without a successful tool result. PDF and DOCX text extraction are supported for reading. Scanned PDFs require OCR, which this tool does not provide. Creation supports XLSX, CSV, TXT, and Markdown only.
