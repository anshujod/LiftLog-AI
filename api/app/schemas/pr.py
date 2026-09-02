import uuid
from datetime import date

from pydantic import BaseModel

from app.schemas.load import LoadValue


class WeightPROut(BaseModel):
    load: LoadValue
    reps: int
    workout_id: uuid.UUID
    performed_on: date


class RepPROut(BaseModel):
    reps: int
    load: LoadValue
    workout_id: uuid.UUID
    performed_on: date


class E1RMPROut(BaseModel):
    estimated_1rm: LoadValue
    load: LoadValue
    reps: int
    workout_id: uuid.UUID
    performed_on: date


class SessionVolumePROut(BaseModel):
    volume: LoadValue
    workout_id: uuid.UUID
    performed_on: date


class ExercisePRsOut(BaseModel):
    weight_pr: WeightPROut | None
    rep_pr: RepPROut | None
    e1rm_pr: E1RMPROut | None
    session_volume_pr: SessionVolumePROut | None
