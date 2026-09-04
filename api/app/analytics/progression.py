import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.analytics._util import bucket_load, first_max
from app.analytics.loads import set_volume_g
from app.analytics.one_rm import estimate_1rm_g
from app.analytics.types import LoadType, ProgressionMetric, SetRecord

MIN_SESSIONS = 3
DIRECTION_THRESHOLD_PCT = 1.0

Direction = Literal["improving", "flat", "declining"]


@dataclass(frozen=True, slots=True)
class ProgressionResult:
    starting_value: int
    current_value: int
    absolute_change: int
    percent_change: float
    session_count: int
    direction: Direction


@dataclass(frozen=True, slots=True)
class InsufficientDataResult:
    session_count: int


def group_by_session(sets: Sequence[SetRecord]) -> list[tuple[date, list[SetRecord]]]:
    """Groups sets by workout_id (a session), sorted chronologically. Warmups are
    dropped here since no progression or plateau metric ever considers them."""
    by_workout: dict[uuid.UUID, list[SetRecord]] = {}
    performed_on_by_workout: dict[uuid.UUID, date] = {}
    for s in sets:
        if s.is_warmup:
            continue
        by_workout.setdefault(s.workout_id, []).append(s)
        performed_on_by_workout.setdefault(s.workout_id, s.performed_on)

    sessions = [
        (performed_on_by_workout[workout_id], session_sets)
        for workout_id, session_sets in by_workout.items()
    ]
    sessions.sort(key=lambda item: item[0])
    return sessions


def most_frequent_load_bucket(sets: Sequence[SetRecord], default_increment_g: int) -> int | None:
    """The exercise's typical working load (mode, bucketed), used as the fixed
    load reps_at_load tracks reps against. Ties keep the bucket seen first."""
    counts: dict[int, int] = {}
    for s in sets:
        if s.is_warmup:
            continue
        bucket = bucket_load(s.load_g, default_increment_g)
        counts[bucket] = counts.get(bucket, 0) + 1
    if not counts:
        return None
    found = first_max(counts.items(), key=lambda item: item[1])
    assert found is not None
    (bucket, _count), _value = found
    return bucket


def session_metric_value(
    session_sets: Sequence[SetRecord],
    metric: ProgressionMetric,
    load_type: LoadType,
    bodyweight_g: int | None,
    frequent_bucket: int | None,
    default_increment_g: int,
) -> int | None:
    """The single number a session contributes toward `metric`, or None if this
    session has nothing valid to say about it (e.g. no set at the tracked load,
    or every set's reps put e1RM out of its valid window)."""
    working = [s for s in session_sets if not s.is_warmup]
    if not working:
        return None

    if metric == ProgressionMetric.VOLUME:
        return sum(set_volume_g(s.load_g, s.reps, load_type, bodyweight_g) for s in working)

    if metric == ProgressionMetric.TOP_WEIGHT:
        return max(s.load_g for s in working)

    if metric == ProgressionMetric.E1RM:
        found = first_max(
            working, key=lambda s: estimate_1rm_g(s.load_g, s.reps, load_type, bodyweight_g)
        )
        return found[1] if found else None

    if metric == ProgressionMetric.REPS_AT_LOAD:
        if frequent_bucket is None:
            return None
        matching_reps = [
            s.reps for s in working if bucket_load(s.load_g, default_increment_g) == frequent_bucket
        ]
        return max(matching_reps) if matching_reps else None

    raise ValueError(f"Unsupported progression metric: {metric}")


def compute_progression(
    sets: Sequence[SetRecord],
    metric: ProgressionMetric,
    load_type: LoadType,
    bodyweight_g: int | None,
    default_increment_g: int,
) -> ProgressionResult | InsufficientDataResult:
    """`sets` should already be scoped to whatever period the caller wants
    (30d/90d/1y/all) — this function has no notion of "today" to stay pure."""
    sessions = group_by_session(sets)
    frequent_bucket = (
        most_frequent_load_bucket(
            [s for _, session_sets in sessions for s in session_sets], default_increment_g
        )
        if metric == ProgressionMetric.REPS_AT_LOAD
        else None
    )

    values: list[int] = []
    for _performed_on, session_sets in sessions:
        value = session_metric_value(
            session_sets, metric, load_type, bodyweight_g, frequent_bucket, default_increment_g
        )
        if value is not None:
            values.append(value)

    if len(values) < MIN_SESSIONS:
        return InsufficientDataResult(session_count=len(values))

    starting_value = values[0]
    current_value = values[-1]
    absolute_change = current_value - starting_value
    percent_change = (absolute_change / starting_value * 100) if starting_value != 0 else 0.0

    direction: Direction
    if percent_change > DIRECTION_THRESHOLD_PCT:
        direction = "improving"
    elif percent_change < -DIRECTION_THRESHOLD_PCT:
        direction = "declining"
    else:
        direction = "flat"

    return ProgressionResult(
        starting_value=starting_value,
        current_value=current_value,
        absolute_change=absolute_change,
        percent_change=round(percent_change, 1),
        session_count=len(values),
        direction=direction,
    )
