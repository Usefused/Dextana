from typing import Literal
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict, model_validator


class ScheduleInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=32000)
    model: str = Field(min_length=1, max_length=200)
    expression: str = Field(default='', max_length=200)
    runAt: str | None = None
    kind: Literal['task', 'reminder'] = 'task'
    timezone: str = Field(min_length=1, max_length=100)
    enabled: bool

    @model_validator(mode='after')
    def timing(self):
        if bool(self.expression) == bool(self.runAt):
            raise ValueError('Choose either a cron expression or a one-time date.')
        if self.runAt:
            date = datetime.fromisoformat(self.runAt)
            if date.tzinfo is None:
                raise ValueError('The one-time date must include a UTC offset.')
        return self
