from collections.abc import Sequence

from app.analytics.progression import (
    group_by_session,
    most_frequent_load_bucket,
    session_metric_value,
)
from app.analytics.types import LoadType, ProgressionMetric, SetRecord


def weekly_best(
    set_records: Sequence[SetRecord],
    metric: ProgressionMetric,
    load_type: LoadType,
    bodyweight_g: int | None,
    default_increment_g: int,
) -> int | None:
    """Best single value for one week of sets: the max session value for
    strength metrics, the summed volume for volume work. None when the week
    says nothing valid about the metric."""
    sessions = group_by_session(set_records)
    if not sessions:
        return None
    bucket = (
        most_frequent_load_bucket(
            [s for _, session_sets in sessions for s in session_sets], default_increment_g
        )
        if metric == ProgressionMetric.REPS_AT_LOAD
        else None
    )
    values = [
        value
        for _, session_sets in sessions
        if (
            value := session_metric_value(
                session_sets, metric, load_type, bodyweight_g, bucket, default_increment_g
            )
        )
        is not None
    ]
    if not values:
        return None
    return sum(values) if metric == ProgressionMetric.VOLUME else max(values)


def percent_change(current: int, previous: int) -> float | None:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)
