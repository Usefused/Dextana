from typing import Annotated
from pydantic import BaseModel, ConfigDict
from harnest.content import Image, ImageConstraints


class DesktopResult(BaseModel):
    """Device values with screenshot media kept out of serialized model text."""
    model_config = ConfigDict(extra='allow')
    image: Annotated[Image, ImageConstraints(max_bytes=5_000_000)] | None = None
