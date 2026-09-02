import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.analytics._util import first_max
from app.analytics.loads import set_volume_g
from app.analytics.one_rm import estimate_1rm_g
from app.analytics.types import LoadType, SetRecord


@dataclass(frozen=True, slots=True)
class SessionSummary:
    workout_id: uuid.UUID
    performed_on: date
    total_volume_g: int
    top_set: SetRecord | None
    working_set_count: int
    best_e1rm_g: int | None


@dataclass(frozen=True, slots=True)
class ExerciseSummary:
    session_count: int
    lifetime_volume_g: int
    best_e1rm_g: int | None
    best_weight_g: int | None


def summarize_session(
    sets: Sequence[SetRecord], load_type: LoadType, bodyweight_g: int | None
) -> SessionSummary | None:
    if not sets:
        return None

    working_sets = [s for s in sets if not s.is_warmup]
    total_volume = sum(
        set_volume_g(s.load_g, s.reps, load_type, bodyweight_g) for s in working_sets
    )

    top_set_found = first_max(working_sets, key=lambda s: s.load_g)
    best_e1rm_found = first_max(
        working_sets, key=lambda s: estimate_1rm_g(s.load_g, s.reps, load_type, bodyweight_g)
    )

    return SessionSummary(
        workout_id=sets[0].workout_id,
        performed_on=sets[0].performed_on,
        total_volume_g=total_volume,
        top_set=top_set_found[0] if top_set_found else None,
        working_set_count=len(working_sets),
        best_e1rm_g=best_e1rm_found[1] if best_e1rm_found else None,
    )


def summarize_exercise(sessions: Sequence[SessionSummary]) -> ExerciseSummary:
    best_e1rm_found = first_max(sessions, key=lambda s: s.best_e1rm_g)
    best_weight_found = first_max(
        sessions, key=lambda s: s.top_set.load_g if s.top_set is not None else None
    )

    return ExerciseSummary(
        session_count=len(sessions),
        lifetime_volume_g=sum(s.total_volume_g for s in sessions),
        best_e1rm_g=best_e1rm_found[1] if best_e1rm_found else None,
        best_weight_g=best_weight_found[1] if best_weight_found else None,
    )
