from typing import Annotated
from pydantic import BaseModel, ConfigDict
from harnest.content import Image, ImageConstraints


class BrowserResult(BaseModel):
    """Browser inspection values, optionally accompanied by actual screenshot media."""
    model_config = ConfigDict(extra="allow")
    image: Annotated[Image, ImageConstraints(max_bytes=5_000_000)] | None = None
