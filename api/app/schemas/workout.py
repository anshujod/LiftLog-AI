import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exercise import ExerciseOut
from app.schemas.load import LoadValue


class SetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    load_g: int
    reps: int
    is_warmup: bool = False
    rpe: float | None = Field(default=None, ge=1, le=10)
    notes: str | None = None


class SetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    load_g: int | None = None
    reps: int | None = None
    is_warmup: bool | None = None
    rpe: float | None = Field(default=None, ge=1, le=10)
    notes: str | None = None


class SetOut(BaseModel):
    id: uuid.UUID
    set_number: int
    load: LoadValue
    reps: int
    is_warmup: bool
    rpe: float | None
    notes: str | None


class WorkoutExerciseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: uuid.UUID
    notes: str | None = None


class WorkoutExerciseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: int | None = Field(default=None, ge=1)
    notes: str | None = None


class WorkoutExerciseOut(BaseModel):
    id: uuid.UUID
    exercise: ExerciseOut
    position: int
    notes: str | None
    sets: list[SetOut]


class WorkoutCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_on: date | None = None
    title: str | None = None
    notes: str | None = None


class WorkoutUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    performed_on: date | None = None
    title: str | None = None
    notes: str | None = None


class WorkoutOut(BaseModel):
    id: uuid.UUID
    performed_on: date
    started_at: datetime | None
    ended_at: datetime | None
    title: str | None
    notes: str | None
    workout_exercises: list[WorkoutExerciseOut]


class WorkoutSummaryOut(BaseModel):
    id: uuid.UUID
    performed_on: date
    started_at: datetime | None
    ended_at: datetime | None
    title: str | None
    exercise_count: int


class WorkoutsPageOut(BaseModel):
    workouts: list[WorkoutSummaryOut]
    next_cursor: str | None


class NewPROut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    pr_type: Literal["weight", "rep", "e1rm", "session_volume"]
    value: LoadValue
    reps: int | None
    workout_id: uuid.UUID
    performed_on: date


class FinishSummaryOut(BaseModel):
    exercise_count: int
    total_working_sets: int
    total_volume: LoadValue
    duration_minutes: int
    new_prs: list[NewPROut]
