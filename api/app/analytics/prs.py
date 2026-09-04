import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.analytics._util import bucket_load, first_max
from app.analytics.loads import set_volume_g
from app.analytics.one_rm import estimate_1rm_g
from app.analytics.types import LoadType, SetRecord


@dataclass(frozen=True, slots=True)
class SetPR:
    value: int
    set_record: SetRecord


@dataclass(frozen=True, slots=True)
class SessionVolumePR:
    value: int
    workout_id: uuid.UUID
    performed_on: date


@dataclass(frozen=True, slots=True)
class PRResult:
    weight_pr: SetPR | None
    rep_pr: SetPR | None
    e1rm_pr: SetPR | None
    session_volume_pr: SessionVolumePR | None


def weight_pr(sets: Iterable[SetRecord]) -> SetPR | None:
    working_sets = [s for s in sets if not s.is_warmup]
    found = first_max(working_sets, key=lambda s: s.load_g)
    return SetPR(value=found[1], set_record=found[0]) if found else None


def e1rm_pr(
    sets: Iterable[SetRecord], load_type: LoadType, bodyweight_g: int | None
) -> SetPR | None:
    working_sets = [s for s in sets if not s.is_warmup]
    found = first_max(
        working_sets, key=lambda s: estimate_1rm_g(s.load_g, s.reps, load_type, bodyweight_g)
    )
    return SetPR(value=found[1], set_record=found[0]) if found else None


def rep_pr(sets: Iterable[SetRecord], default_increment_g: int) -> SetPR | None:
    """Best reps at a single (bucketed) load, so plate-rounding noise (60.0 vs 60.4 kg)
    doesn't fragment one working weight into unrelated records."""
    best_by_bucket: dict[int, SetPR] = {}
    for record in sets:
        if record.is_warmup:
            continue
        bucket = bucket_load(record.load_g, default_increment_g)
        current = best_by_bucket.get(bucket)
        if current is None or record.reps > current.value:
            best_by_bucket[bucket] = SetPR(value=record.reps, set_record=record)

    found = first_max(best_by_bucket.values(), key=lambda pr: pr.value)
    return found[0] if found else None


def session_volume_pr(
    sets: Iterable[SetRecord], load_type: LoadType, bodyweight_g: int | None
) -> SessionVolumePR | None:
    volume_by_workout: dict[uuid.UUID, int] = {}
    performed_on_by_workout: dict[uuid.UUID, date] = {}

    for record in sets:
        if record.is_warmup:
            continue
        volume = set_volume_g(record.load_g, record.reps, load_type, bodyweight_g)
        volume_by_workout[record.workout_id] = volume_by_workout.get(record.workout_id, 0) + volume
        performed_on_by_workout.setdefault(record.workout_id, record.performed_on)

    found = first_max(volume_by_workout.items(), key=lambda item: item[1])
    if found is None:
        return None
    (workout_id, _volume), value = found
    return SessionVolumePR(
        value=value, workout_id=workout_id, performed_on=performed_on_by_workout[workout_id]
    )


def compute_prs(
    sets: Iterable[SetRecord],
    load_type: LoadType,
    bodyweight_g: int | None,
    default_increment_g: int,
) -> PRResult:
    materialized = list(sets)
    return PRResult(
        weight_pr=weight_pr(materialized),
        rep_pr=rep_pr(materialized, default_increment_g),
        e1rm_pr=e1rm_pr(materialized, load_type, bodyweight_g),
        session_volume_pr=session_volume_pr(materialized, load_type, bodyweight_g),
    )
