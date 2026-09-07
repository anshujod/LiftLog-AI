from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.analytics import (
    PlateauOut,
    ProgressionOut,
    TopImprovingExerciseOut,
    WeeklyVolumeOut,
)
from app.schemas.pr import ExercisePRsOut
from app.schemas.session import SessionOut
from app.schemas.workout import NewPROut

UnitName = Literal["kg", "lb"]


class ExerciseProgressPayload(BaseModel):
    """Everything the interpreter may say about one exercise.

    All numbers are precomputed by `analytics/`; the model adds words only.
    """

    model_config = ConfigDict(extra="forbid")

    exercise_id: str
    exercise_name: str
    progression_metric: str
    progression: ProgressionOut
    bests: ExercisePRsOut
    recent_sessions: list[SessionOut] = Field(default_factory=list, max_length=8)


class DashboardPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_days: int
    workout_count: int
    current_streak_weeks: int
    weekly_volume: WeeklyVolumeOut
    top_improving_exercises: list[TopImprovingExerciseOut]
    recent_prs: list[NewPROut] = Field(default_factory=list, max_length=10)


class ProgressAnalysisPayload(BaseModel):
    """The single grounded context an insight is written from.

    `unit` is explicit so the interpreter never guesses a unit, and
    `has_sufficient_data` tells it when to decline a trend claim.
    """

    model_config = ConfigDict(extra="forbid")

    unit: UnitName
    period: str
    has_sufficient_data: bool
    session_count: int
    focus_exercise: ExerciseProgressPayload | None = None
    dashboard: DashboardPayload
    plateaus: list[PlateauOut]


class Insight(BaseModel):
    """A model-written interpretation of a payload. Prose only — every figure
    in `summary` must already exist in the payload it was grounded in."""

    model_config = ConfigDict(extra="forbid")

    summary: str
    model: str
    prompt_version: str
    generated_at: datetime


class Recommendation(BaseModel):
    """Shape reserved for suggestion surfaces; the set scheme itself is always
    computed deterministically elsewhere, the model only explains it."""

    model_config = ConfigDict(extra="forbid")

    headline: str
    explanation: str
    model: str


class ChatMessage(BaseModel):
    """One turn of a chat conversation. The system prompt travels separately;
    tool exchanges are folded into user-role messages so every provider sees
    a plain alternating transcript."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str
