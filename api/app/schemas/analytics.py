import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.load import LoadValue
from app.schemas.workout import NewPROut, WorkoutSummaryOut

ProgressionMetricName = Literal["e1rm", "top_weight", "volume", "reps_at_load"]
Direction = Literal["improving", "flat", "declining"]


class ProgressionOut(BaseModel):
    metric: ProgressionMetricName
    has_data: bool
    session_count: int
    starting_value: int | None = None
    current_value: int | None = None
    starting_display: str | None = None
    current_display: str | None = None
    absolute_change: int | None = None
    percent_change: float | None = None
    direction: Direction | None = None


class TopImprovingExerciseOut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    metric: ProgressionMetricName
    percent_change: float


class WeeklyVolumeOut(BaseModel):
    current_week: LoadValue
    previous_week: LoadValue
    percent_change: float | None


class DashboardOut(BaseModel):
    recent_workouts: list[WorkoutSummaryOut]
    top_improving_exercises: list[TopImprovingExerciseOut]
    recent_prs: list[NewPROut]
    weekly_volume: WeeklyVolumeOut
    workout_count: int
    current_streak_weeks: int
    period_days: int


class MuscleGroupVolumeOut(BaseModel):
    muscle_group_slug: str
    muscle_group_name: str
    volume: LoadValue
    working_set_count: int


class VolumeByPeriodOut(BaseModel):
    period_start: date
    volume: LoadValue


class PlateauOut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    metric: ProgressionMetricName
    session_count: int
    window_start: date
    window_end: date
    window_days: int
    weeks_since_new_best: int
    improvement_pct: float
