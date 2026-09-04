import uuid
from datetime import date, timedelta

from app.analytics.aggregates import (
    consistency_streak,
    volume_by_muscle_group,
    volume_by_period,
    workout_frequency,
)
from app.analytics.types import ExerciseSetRecord, LoadType


def _set(
    load_g: int,
    reps: int,
    load_type: LoadType,
    muscle_group_slug: str,
    performed_on: date,
    *,
    is_warmup: bool = False,
) -> ExerciseSetRecord:
    return ExerciseSetRecord(
        load_g=load_g,
        reps=reps,
        is_warmup=is_warmup,
        performed_on=performed_on,
        workout_id=uuid.uuid4(),
        load_type=load_type,
        muscle_group_slug=muscle_group_slug,
    )


class TestVolumeByPeriod:
    def test_weekly_buckets_sum_within_the_same_iso_week(self) -> None:
        monday = date(2026, 1, 5)
        sets = [
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", monday),
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", monday + timedelta(days=2)),
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", monday + timedelta(days=9)),
        ]
        result = volume_by_period(sets, None, "week")
        assert len(result) == 2
        assert result[0].period_start == monday
        assert result[0].total_volume_g == 2_000_000
        assert result[1].total_volume_g == 1_000_000

    def test_monthly_buckets(self) -> None:
        sets = [
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", date(2026, 1, 15)),
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", date(2026, 1, 20)),
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", date(2026, 2, 1)),
        ]
        result = volume_by_period(sets, None, "month")
        assert len(result) == 2
        assert result[0].period_start == date(2026, 1, 1)
        assert result[0].total_volume_g == 2_000_000

    def test_warmups_excluded(self) -> None:
        sets = [_set(200000, 1, LoadType.BARBELL_TOTAL, "chest", date(2026, 1, 5), is_warmup=True)]
        assert volume_by_period(sets, None, "week") == []

    def test_empty_input_returns_empty_list(self) -> None:
        assert volume_by_period([], None, "week") == []


class TestVolumeByMuscleGroup:
    def test_doubles_dumbbell_per_hand_volume(self) -> None:
        sets = [_set(20000, 10, LoadType.DUMBBELL_PER_HAND, "chest", date(2026, 1, 5))]
        result = volume_by_muscle_group(sets, None)
        assert len(result) == 1
        assert result[0].muscle_group_slug == "chest"
        assert result[0].total_volume_g == 400_000
        assert result[0].working_set_count == 1

    def test_groups_and_sums_per_muscle_group(self) -> None:
        d = date(2026, 1, 5)
        sets = [
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", d),
            _set(50000, 10, LoadType.BARBELL_TOTAL, "back", d),
            _set(100000, 10, LoadType.BARBELL_TOTAL, "chest", d),
        ]
        result = volume_by_muscle_group(sets, None)
        by_slug = {r.muscle_group_slug: r for r in result}
        assert by_slug["chest"].total_volume_g == 2_000_000
        assert by_slug["chest"].working_set_count == 2
        assert by_slug["back"].total_volume_g == 500_000
        assert by_slug["back"].working_set_count == 1

    def test_empty_input_returns_empty_list(self) -> None:
        assert volume_by_muscle_group([], None) == []


class TestWorkoutFrequency:
    def test_counts_workouts(self) -> None:
        dates = [date(2026, 1, 1), date(2026, 1, 3), date(2026, 1, 10)]
        assert workout_frequency(dates) == 3

    def test_empty_input_returns_zero(self) -> None:
        assert workout_frequency([]) == 0


class TestConsistencyStreak:
    def test_counts_consecutive_weeks_including_current(self) -> None:
        as_of = date(2026, 1, 19)
        dates = [date(2026, 1, 19), date(2026, 1, 12), date(2026, 1, 5)]
        assert consistency_streak(dates, as_of) == 3

    def test_stops_at_the_first_missing_week(self) -> None:
        as_of = date(2026, 1, 19)
        dates = [date(2026, 1, 19), date(2026, 1, 1)]
        assert consistency_streak(dates, as_of) == 1

    def test_no_workout_this_week_returns_zero(self) -> None:
        as_of = date(2026, 1, 19)
        dates = [date(2026, 1, 5)]
        assert consistency_streak(dates, as_of) == 0

    def test_empty_input_returns_zero(self) -> None:
        assert consistency_streak([], date(2026, 1, 19)) == 0
