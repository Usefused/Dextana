from typing import Literal
from pydantic import BaseModel, Field, ConfigDict


class ScheduleInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=32000)
    model: str = Field(min_length=1, max_length=200)
    expression: str = Field(min_length=1, max_length=200)
    timezone: str = Field(min_length=1, max_length=100)
    enabled: bool


class RunReport(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['starting', 'running', 'completed', 'cancelled', 'failed', 'interrupted']
    activityId: str | None = Field(default=None, max_length=100)
    error: str | None = Field(default=None, max_length=2000)
