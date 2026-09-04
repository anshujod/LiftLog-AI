import enum
import uuid
from dataclasses import dataclass
from datetime import date


class LoadType(enum.StrEnum):
    BARBELL_TOTAL = "barbell_total"
    DUMBBELL_PER_HAND = "dumbbell_per_hand"
    MACHINE_TOTAL = "machine_total"
    BODYWEIGHT = "bodyweight"
    BODYWEIGHT_ADDED = "bodyweight_added"
    ASSISTED = "assisted"


class ProgressionMetric(enum.StrEnum):
    E1RM = "e1rm"
    TOP_WEIGHT = "top_weight"
    VOLUME = "volume"
    REPS_AT_LOAD = "reps_at_load"


@dataclass(frozen=True, slots=True)
class SetRecord:
    load_g: int
    reps: int
    is_warmup: bool
    performed_on: date
    workout_id: uuid.UUID


@dataclass(frozen=True, slots=True)
class ExerciseSetRecord:
    """A SetRecord plus the per-exercise context needed to aggregate volume across
    exercises with different load types and muscle groups in one pass."""

    load_g: int
    reps: int
    is_warmup: bool
    performed_on: date
    workout_id: uuid.UUID
    load_type: LoadType
    muscle_group_slug: str
