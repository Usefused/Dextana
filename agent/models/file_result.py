from typing import Annotated, Any
from pydantic import BaseModel
from harnest.content import Image, ImageConstraints


class FileResult(BaseModel):
    """Document values or typed image media after an approved desktop read."""
    path: str | None = None
    format: str | None = None
    content: str | None = None
    sheets: list[dict[str, Any]] | None = None
    note: str | None = None
    created: bool | None = None
    bytes: int | None = None
    error: str | None = None
    image: Annotated[Image, ImageConstraints(max_bytes=5_000_000)] | None = None
