from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.analytics.loads import set_volume_g
from app.analytics.types import ExerciseSetRecord

Granularity = Literal["week", "month"]


@dataclass(frozen=True, slots=True)
class PeriodVolume:
    period_start: date
    total_volume_g: int


@dataclass(frozen=True, slots=True)
class MuscleGroupVolume:
    muscle_group_slug: str
    total_volume_g: int
    working_set_count: int


def _period_start(d: date, granularity: Granularity) -> date:
    if granularity == "week":
        return d - timedelta(days=d.weekday())
    return d.replace(day=1)


def volume_by_period(
    sets: Sequence[ExerciseSetRecord], bodyweight_g: int | None, granularity: Granularity
) -> list[PeriodVolume]:
    totals: dict[date, int] = {}
    for s in sets:
        if s.is_warmup:
            continue
        bucket = _period_start(s.performed_on, granularity)
        volume = set_volume_g(s.load_g, s.reps, s.load_type, bodyweight_g)
        totals[bucket] = totals.get(bucket, 0) + volume
    return [PeriodVolume(period_start=k, total_volume_g=v) for k, v in sorted(totals.items())]


def volume_by_muscle_group(
    sets: Sequence[ExerciseSetRecord], bodyweight_g: int | None
) -> list[MuscleGroupVolume]:
    totals: dict[str, int] = {}
    counts: dict[str, int] = {}
    for s in sets:
        if s.is_warmup:
            continue
        volume = set_volume_g(s.load_g, s.reps, s.load_type, bodyweight_g)
        totals[s.muscle_group_slug] = totals.get(s.muscle_group_slug, 0) + volume
        counts[s.muscle_group_slug] = counts.get(s.muscle_group_slug, 0) + 1
    return [
        MuscleGroupVolume(
            muscle_group_slug=slug, total_volume_g=totals[slug], working_set_count=counts[slug]
        )
        for slug in sorted(totals)
    ]


def workout_frequency(workout_dates: Sequence[date]) -> int:
    """Count of workouts — `workout_dates` should already be scoped to whatever
    period the caller cares about."""
    return len(workout_dates)


def consistency_streak(workout_dates: Sequence[date], as_of: date) -> int:
    """Consecutive weeks (including the current one) with at least one workout,
    counting back from `as_of`. `as_of` is an explicit parameter rather than
    `date.today()` so this stays a pure function."""
    weeks_with_workout = {_period_start(d, "week") for d in workout_dates}
    streak = 0
    cursor = _period_start(as_of, "week")
    while cursor in weeks_with_workout:
        streak += 1
        cursor -= timedelta(days=7)
    return streak
