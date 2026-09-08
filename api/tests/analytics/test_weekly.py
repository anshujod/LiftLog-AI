import uuid
from datetime import date, timedelta

from app.analytics.one_rm import estimate_1rm_g
from app.analytics.types import LoadType, ProgressionMetric, SetRecord
from app.analytics.weekly import percent_change, weekly_best

START = date(2026, 1, 1)


def _records(day_offset: int, load_g: int, reps: int) -> list[SetRecord]:
    workout_id = uuid.uuid4()
    return [
        SetRecord(
            load_g=load_g,
            reps=reps,
            is_warmup=False,
            performed_on=START + timedelta(days=day_offset),
            workout_id=workout_id,
        )
    ]


def _week(specs: list[tuple[int, int, int]]) -> list[SetRecord]:
    return [record for day, load_g, reps in specs for record in _records(day, load_g, reps)]


def test_weekly_best_takes_max_session_e1rm() -> None:
    records = _week([(0, 100000, 5), (2, 100000, 6)])
    assert weekly_best(records, ProgressionMetric.E1RM, LoadType.BARBELL_TOTAL, None, 2500) == (
        estimate_1rm_g(100000, 6, LoadType.BARBELL_TOTAL, None)
    )


def test_weekly_best_sums_volume() -> None:
    records = _week([(0, 50000, 10), (2, 50000, 10)])
    assert weekly_best(records, ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500) == (
        50000 * 10 + 50000 * 10
    )


def test_weekly_best_empty_is_none() -> None:
    assert weekly_best([], ProgressionMetric.E1RM, LoadType.BARBELL_TOTAL, None, 2500) is None


def test_percent_change() -> None:
    assert percent_change(110, 100) == 10.0
    assert percent_change(100, 0) is None
