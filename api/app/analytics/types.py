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


@dataclass(frozen=True, slots=True)
class SetRecord:
    load_g: int
    reps: int
    is_warmup: bool
    performed_on: date
    workout_id: uuid.UUID
