from pydantic import BaseModel, Field


class WorkItem(BaseModel):
    prompt: str = Field(description="A self-contained work assignment for one independent agent", min_length=1, max_length=32000)
    model: str = Field(default="", description="An Ollama model selected by the owner, or empty to inherit this activity's model")
