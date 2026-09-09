from typing import Literal
from harnest.agent import client_tool
from harnest.models.file_result import FileResult


@client_tool
def files(action: Literal["read", "create"], path: str, content: str = "", sheets_json: str = "") -> FileResult:
    """Read or create work documents after the desktop obtains the owner's permission.

    action: read returns UTF-8 text, extracted PDF/DOCX text, or Excel worksheet values. create produces a new
        document, never overwriting an existing file. Read: .xlsx, .csv, .txt, .md, .docx, .pdf, .png, .jpg, .jpeg, .gif, .webp. Create: .xlsx, .csv, .txt, .md.
        Images are handled by the configured image interpreter, or delivered directly to the chat model when no interpreter is configured. They are not encoded text.
        Scanned PDFs without a text layer require OCR and cannot be read by this tool.
        No shell commands, source-code editing, macros, or formula execution.
    path: Absolute path to read. For creation use a simple filename to save in the
        owner's Dextana documents folder, or an absolute path in an existing folder.
    content: Document body for .txt or .md creation. Leave empty when reading.
    sheets_json: For .xlsx or .csv creation, JSON array of objects with name and rows,
        e.g. [{"name":"Budget","rows":[["Item","Cost"],["Travel",250]]}].
        Use scalar cell values only, with the first row as headers. CSV has one table;
        Excel supports up to 20 sheets and 10,000 total cells. Formulas are not calculated.
    """
    ...
