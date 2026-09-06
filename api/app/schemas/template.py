import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exercise import ExerciseOut


class TemplateExerciseIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: uuid.UUID
    target_sets: int | None = Field(default=None, gt=0, le=50)
    notes: str | None = None


class TemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    notes: str | None = None
    exercises: list[TemplateExerciseIn] = Field(default_factory=list, max_length=50)


class TemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = None
    exercises: list[TemplateExerciseIn] | None = Field(default=None, max_length=50)


class TemplateExerciseOut(BaseModel):
    id: uuid.UUID
    exercise: ExerciseOut
    position: int
    target_sets: int | None
    notes: str | None


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    notes: str | None
    created_at: datetime
    exercises: list[TemplateExerciseOut]


class TemplateSummaryOut(BaseModel):
    id: uuid.UUID
    name: str
    notes: str | None
    created_at: datetime
    exercise_count: int


class TemplateFromWorkoutIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    notes: str | None = None
