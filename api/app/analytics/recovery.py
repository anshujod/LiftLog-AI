from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from app.analytics.types import ExerciseSetRecord

RecoveryStatus = Literal["ready", "recovering", "rest"]


@dataclass(frozen=True, slots=True)
class MuscleRecovery:
    muscle_group_slug: str
    percent: int
    status: RecoveryStatus
    last_trained_on: date | None


# Estimated full-recovery windows per group, in hours. Bigger groups and
# typically-heavier volumes need longer. These are heuristics, surfaced in
# the UI as estimates — not physiological measurements.
BASE_WINDOW_H: dict[str, float] = {
    "legs": 72.0,
    "back": 60.0,
    "chest": 48.0,
    "shoulders": 48.0,
    "biceps": 36.0,
    "triceps": 36.0,
    "abs": 36.0,
}

_DEFAULT_WINDOW_H = 48.0

# A session within the last 12h always reads as "rest" regardless of volume.
_REST_FLOOR_H = 12.0
# Below this percent after a hard week, advise rest rather than recovering.
_REST_PERCENT_CUTOFF = 25
_HARD_WEEK_SETS = 12
_LIGHT_WEEK_SETS = 4
_HARD_FACTOR = 1.5
_LIGHT_FACTOR = 0.75

_RECENT_WINDOW_DAYS = 7
_STALE_AFTER_DAYS = 30


def _window_h(slug: str, recent_sets: int) -> float:
    base = BASE_WINDOW_H.get(slug, _DEFAULT_WINDOW_H)
    if recent_sets >= _HARD_WEEK_SETS:
        return base * _HARD_FACTOR
    if recent_sets <= _LIGHT_WEEK_SETS:
        return base * _LIGHT_FACTOR
    return base


def compute_recovery(
    sets: Sequence[ExerciseSetRecord], slugs: Sequence[str], as_of: date
) -> list[MuscleRecovery]:
    """Estimate per-group recovery from recency × recent workload.

    `sets` may span any period; only working sets on/before `as_of` are read.
    Every slug in `slugs` appears in the output — groups with no recent
    training report ready/100. `as_of` is explicit (not `date.today()`) so
    this stays a pure function.
    """
    recent_cutoff = as_of - timedelta(days=_RECENT_WINDOW_DAYS)

    last_trained: dict[str, date] = {}
    recent_sets: dict[str, int] = {}
    for s in sets:
        if s.is_warmup or s.performed_on > as_of:
            continue
        if (
            s.muscle_group_slug not in last_trained
            or s.performed_on > last_trained[s.muscle_group_slug]
        ):
            last_trained[s.muscle_group_slug] = s.performed_on
        if s.performed_on >= recent_cutoff:
            recent_sets[s.muscle_group_slug] = recent_sets.get(s.muscle_group_slug, 0) + 1

    results: list[MuscleRecovery] = []
    for slug in slugs:
        trained_on = last_trained.get(slug)
        if trained_on is None or trained_on < as_of - timedelta(days=_STALE_AFTER_DAYS):
            results.append(
                MuscleRecovery(
                    muscle_group_slug=slug, percent=100, status="ready", last_trained_on=trained_on
                )
            )
            continue

        elapsed_h = (as_of - trained_on).days * 24.0
        window = _window_h(slug, recent_sets.get(slug, 0))
        percent = min(100, round(elapsed_h / window * 100))

        if elapsed_h < _REST_FLOOR_H or (
            percent < _REST_PERCENT_CUTOFF and recent_sets.get(slug, 0) >= _HARD_WEEK_SETS
        ):
            status: RecoveryStatus = "rest"
        elif percent >= 100:
            status = "ready"
        else:
            status = "recovering"
        results.append(
            MuscleRecovery(
                muscle_group_slug=slug,
                percent=percent,
                status=status,
                last_trained_on=trained_on,
            )
        )
    return results
