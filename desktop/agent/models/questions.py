from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class QuestionOption(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    label: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)

    @field_validator('label')
    @classmethod
    def valid_label(cls, value):
        if not value.strip():
            raise ValueError('An option needs a label')
        return value.strip()

    @field_validator('description')
    @classmethod
    def clean_description(cls, value):
        return value.strip() or None if value is not None else None

    @field_validator('id')
    @classmethod
    def valid_id(cls, value):
        if value in ('__proto__', 'constructor', 'prototype'):
            raise ValueError('Invalid question identifier')
        return value


class Question(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=80, pattern=r'^[a-zA-Z0-9_-]+$')
    prompt: str = Field(min_length=1, max_length=500)
    type: Literal['text', 'single', 'multiple']
    required: bool = True
    multiline: bool = Field(default=False, description="Use a text area only for answers that need multiple lines or a longer explanation. Short answers use a single-line input by default.")
    options: list[QuestionOption] = Field(default_factory=list, max_length=12)

    @model_validator(mode='after')
    def valid_question(self):
        QuestionOption.valid_id(self.id)
        if not self.prompt.strip() or (self.type != 'text' and not self.options):
            raise ValueError('Provide a question and choices for selection questions')
        if len({option.id for option in self.options}) != len(self.options):
            raise ValueError('Option IDs must be unique')
        return self


class QuestionsForm(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=160)
    questions: list[Question] = Field(min_length=1, max_length=6)

    @model_validator(mode='after')
    def unique_questions(self):
        if not self.title.strip() or len({item.id for item in self.questions}) != len(self.questions):
            raise ValueError('Provide a title and unique question IDs')
        return self
