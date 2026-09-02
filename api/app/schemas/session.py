import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.load import LoadValue
from app.schemas.pr import ExercisePRsOut


class SetOut(BaseModel):
    id: uuid.UUID
    set_number: int
    load: LoadValue
    reps: int
    is_warmup: bool
    rpe: float | None
    notes: str | None


class SessionOut(BaseModel):
    workout_id: uuid.UUID
    performed_on: date
    sets: list[SetOut]
    volume: LoadValue
    working_set_count: int
    best_e1rm: LoadValue | None


class LastSessionOut(BaseModel):
    has_data: bool
    session: SessionOut | None
    bests: ExercisePRsOut


class HistoryPageOut(BaseModel):
    sessions: list[SessionOut]
    next_cursor: str | None
