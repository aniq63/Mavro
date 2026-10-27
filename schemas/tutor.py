from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

WhiteboardActionType = Literal[
    'show_text',
    'show_code',
    'highlight_code',
    'show_variable',
    'show_output',
    'show_table',
    'show_graph',
    'add_shape',
    'add_arrow',
    'update_element',
    'highlight_element',
]

TeachingLayout = Literal[
    'auto',
    'code',
    'flow',
    'stack',
    'queue',
    'tree',
    'equation',
    'concept',
]

LessonMode = Literal['new_lesson', 'follow_up', 'clarification']


class WhiteboardAction(BaseModel):
    model_config = ConfigDict(extra='allow')

    type: WhiteboardActionType | None = None
    id: str | None = None
    text: str | None = None
    code: str | None = None
    line: int | None = None
    variable_name: str | None = None
    value: str | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    color: str | None = None
    shape_type: str | None = None
    stroke_width: float | None = None
    direction: str | None = None
    label: str | None = None
    content: str | None = None
    shape: str | None = None
    role: str | None = None
    target_id: str | None = None
    title: str | None = None
    align: str | None = None
    x_label: str | None = None
    y_label: str | None = None
    columns: list[Any] | None = None
    rows: list[Any] | None = None
    points: list[Any] | None = None
    series: list[dict[str, Any]] | None = None
    from_value: str | None = Field(default=None, alias='from')
    to_value: str | None = Field(default=None, alias='to')

    @field_validator('text', 'code', 'variable_name', 'value', 'label', 'content', 'shape', 'role', 'target_id', 'title', 'align', 'x_label', 'y_label', 'from_value', 'to_value')
    @classmethod
    def strip_string(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @model_validator(mode='after')
    def normalize_flat_model_output(self):
        if self.type is None:
            if self.content is not None:
                self.type = 'show_text'
                self.text = self.content
            elif self.shape is not None:
                self.type = 'add_shape'
                self.shape_type = self.shape
            elif self.from_value is not None or self.to_value is not None:
                self.type = 'add_arrow'
                self.direction = f'{self.from_value or ""} -> {self.to_value or ""}'.strip(' -> ')
        return self


class TeachingStep(BaseModel):
    model_config = ConfigDict(extra='ignore', populate_by_name=True)

    step_id: str = Field(alias='id')
    title: str
    narration: str
    explanation: str | None = None
    layout: TeachingLayout | None = None
    whiteboard_actions: list[WhiteboardAction] = Field(default_factory=list)


class TutorChatRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    conversation_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    board_summary: str | None = None

    @field_validator('conversation_id', 'message')
    @classmethod
    def trim_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError('Value cannot be empty.')
        return cleaned


class TutorResponse(BaseModel):
    model_config = ConfigDict(extra='ignore')

    lesson_id: str | None = None
    mode: LessonMode = 'new_lesson'
    lesson_title: str
    message: str
    spoken_explanation: str
    steps: list[TeachingStep]
    follow_up_question: str | None = None
    board_summary: str | None = None
