import uuid
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.ai.payloads import Insight, ProgressAnalysisPayload
from app.schemas.load import LoadValue
from app.schemas.workout import NewPROut
from app.services.analytics_service import Period


class AnalyzeProgressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: Period = "90d"
    exercise_id: uuid.UUID | None = None


class AnalyzeProgressOut(BaseModel):
    insight: Insight
    payload: ProgressAnalysisPayload


class ChatMessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessageIn] = Field(default_factory=list, max_length=20)


class ToolCallTraceOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    round: int
    name: str
    arguments: dict[str, Any]
    result: dict[str, Any]


class ChatOut(BaseModel):
    answer: str
    model: str
    tool_trace: list[ToolCallTraceOut]


class WorkoutRecommendationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exercise_id: uuid.UUID


class SetSuggestionOut(BaseModel):
    load: LoadValue
    reps: int


class WorkoutRecommendationOut(BaseModel):
    exercise_id: uuid.UUID
    exercise_name: str
    suggested_sets: list[SetSuggestionOut]
    explanation: str
    model: str


class ExerciseWeekChangeOut(BaseModel):
    exercise_name: str
    metric: str
    previous_display: str
    current_display: str
    percent_change: float | None


class WeekSummaryOut(BaseModel):
    week_start: date
    week_end: date
    workouts_completed: int
    total_volume: LoadValue
    changes: list[ExerciseWeekChangeOut]
    new_prs: list[NewPROut]
    observation: str | None
    model: str | None
    cached: bool
