from typing import Literal
from harnest.agent import client_tool
from harnest.models.file_result import FileResult


@client_tool
def files(action: Literal["read", "create", "edit"], path: str, content: str = "", sheets_json: str = "", expected_revision: str = "", edits_json: str = "") -> FileResult:
    """Read, create or edit work documents after the desktop obtains the owner's permission.

    action: read returns UTF-8 text, extracted PDF/DOCX text, or Excel worksheet values. create produces a new
        document, never overwriting an existing file. Read: .xlsx, .csv, .txt, .md, .docx, .pdf, .png, .jpg, .jpeg, .gif, .webp. Create: .xlsx, .csv, .txt, .md.
        edit supports existing UTF-8 text files of any extension (including JSON, YAML and source/configuration files),
        DOCX paragraph text and XLSX literal cells after the owner reviews every change.
        Read the file first. Each edit requires separate approval, even in an approved plan or auto-allow session.
        If a file changes after reading or during review, read it again and submit a new edit. Never retry with a guessed revision.
        Images are handled by the configured image interpreter, or delivered directly to the chat model when no interpreter is configured. They are not encoded text.
        Scanned PDFs without a text layer require OCR and cannot be read by this tool.
        No shell commands, macros, or formula execution. Legacy .doc/.xls, PDF, images and other binary formats cannot be edited.
    path: Absolute path to read or edit. For creation use a simple filename to save in the
        owner's Dextana documents folder, or an absolute path in an existing folder.
    content: Document body for .txt or .md creation; complete replacement text for editing a UTF-8 file.
        Preserve unaffected content, line endings and CSV quoting. An empty string intentionally empties an edited file. Leave empty when reading.
    expected_revision: For editing only, copy the exact revision returned by the most recent read. Never invent it.
    edits_json: For DOCX or XLSX editing instead of content, provide 1–100 targeted edits.
        DOCX: [{"paragraph":1,"find":"old phrase","replace":"new phrase"}]. Read returns paragraph numbers.
        Each find must match once in its paragraph; at most one edit per paragraph. Replacement inherits the first
        matched run's formatting. Unrelated text and package parts are preserved. Complex paragraphs with fields,
        hyperlinks, tracked changes or drawings must be edited in Word. No inserted line breaks/tabs.
        XLSX: [{"sheet":"Budget","cell":"B2","value":300}]. Use existing literal cells only; scalar values or null
        to clear a cell. Formula cells and protected sheets cannot be changed. Formulas elsewhere are preserved;
        Excel recalculates when opened. Cell styles and other package parts are preserved. No sheet/row creation.
    sheets_json: For .xlsx or .csv creation, JSON array of objects with name and rows,
        e.g. [{"name":"Budget","rows":[["Item","Cost"],["Travel",250]]}].
        Use scalar cell values only, with the first row as headers. CSV has one table;
        Excel supports up to 20 sheets and 10,000 total cells. Formulas are not calculated.
    """
    ...
