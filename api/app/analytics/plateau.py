from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date

from app.analytics.loads import set_volume_g
from app.analytics.progression import (
    group_by_session,
    most_frequent_load_bucket,
    session_metric_value,
)
from app.analytics.types import LoadType, ProgressionMetric, SetRecord

MIN_SESSIONS = 6
MIN_WINDOW_DAYS = 42
IMPROVEMENT_THRESHOLD_PCT = 2.5
DELOAD_VOLUME_RATIO = 0.6


@dataclass(frozen=True, slots=True)
class PlateauResult:
    session_count: int
    window_start: date
    window_end: date
    window_days: int
    best_value: int
    best_value_date: date
    weeks_since_new_best: int
    improvement_pct: float


def _is_deload(index: int, volumes: Sequence[int]) -> bool:
    """A session is a deliberate deload — not a break in the streak — if its volume
    falls well under the trailing average of every session before it."""
    if index == 0:
        return False
    trailing = volumes[:index]
    trailing_avg = sum(trailing) / len(trailing)
    if trailing_avg <= 0:
        return False
    return volumes[index] < trailing_avg * DELOAD_VOLUME_RATIO


def detect_plateau(
    sets: Sequence[SetRecord],
    metric: ProgressionMetric,
    load_type: LoadType,
    bodyweight_g: int | None,
    default_increment_g: int,
) -> PlateauResult | None:
    """`sets` should span whatever lookback window the caller wants to scan for a
    plateau in (this has no notion of "today" to stay pure)."""
    sessions = group_by_session(sets)
    if len(sessions) < MIN_SESSIONS:
        return None

    volumes = [
        sum(set_volume_g(s.load_g, s.reps, load_type, bodyweight_g) for s in session_sets)
        for _, session_sets in sessions
    ]

    frequent_bucket = (
        most_frequent_load_bucket(
            [s for _, session_sets in sessions for s in session_sets], default_increment_g
        )
        if metric == ProgressionMetric.REPS_AT_LOAD
        else None
    )

    streak: list[tuple[date, int]] = []
    for index, (performed_on, session_sets) in enumerate(sessions):
        if _is_deload(index, volumes):
            continue
        value = session_metric_value(
            session_sets, metric, load_type, bodyweight_g, frequent_bucket, default_increment_g
        )
        if value is None:
            continue
        streak.append((performed_on, value))

    if len(streak) < MIN_SESSIONS:
        return None

    window_start, window_end = streak[0][0], streak[-1][0]
    window_days = (window_end - window_start).days
    if window_days < MIN_WINDOW_DAYS:
        return None

    baseline = streak[0][1]
    best_value = max(value for _, value in streak)
    best_value_date = next(d for d, value in streak if value == best_value)
    improvement_pct = (best_value - baseline) / baseline * 100 if baseline != 0 else 0.0

    if improvement_pct >= IMPROVEMENT_THRESHOLD_PCT:
        return None

    return PlateauResult(
        session_count=len(streak),
        window_start=window_start,
        window_end=window_end,
        window_days=window_days,
        best_value=best_value,
        best_value_date=best_value_date,
        weeks_since_new_best=(window_end - best_value_date).days // 7,
        improvement_pct=round(improvement_pct, 1),
    )
