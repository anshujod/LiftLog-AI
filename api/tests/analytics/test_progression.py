import uuid
from datetime import date, timedelta

from app.analytics.progression import (
    InsufficientDataResult,
    ProgressionResult,
    compute_progression,
    group_by_session,
    most_frequent_load_bucket,
)
from app.analytics.types import LoadType, ProgressionMetric, SetRecord

START = date(2026, 1, 1)


def _session(
    day_offset: int, sets: list[tuple[int, int]], *, is_warmup_first: bool = False
) -> list[SetRecord]:
    workout_id = uuid.uuid4()
    performed_on = START + timedelta(days=day_offset)
    return [
        SetRecord(
            load_g=load_g,
            reps=reps,
            is_warmup=is_warmup_first and i == 0,
            performed_on=performed_on,
            workout_id=workout_id,
        )
        for i, (load_g, reps) in enumerate(sets)
    ]


def _flatten(sessions: list[list[SetRecord]]) -> list[SetRecord]:
    return [s for session in sessions for s in session]


class TestComputeProgressionVolume:
    def test_linear_improvement_returns_correct_percentage(self) -> None:
        sessions = [
            _session(0, [(100000, 10)]),
            _session(7, [(110000, 10)]),
            _session(14, [(120000, 10)]),
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.starting_value == 1_000_000
        assert result.current_value == 1_200_000
        assert result.absolute_change == 200_000
        assert result.percent_change == 20.0
        assert result.session_count == 3
        assert result.direction == "improving"

    def test_declining_series(self) -> None:
        sessions = [
            _session(0, [(120000, 10)]),
            _session(7, [(110000, 10)]),
            _session(14, [(100000, 10)]),
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.direction == "declining"

    def test_flat_series(self) -> None:
        sessions = [_session(i * 7, [(100000, 10)]) for i in range(3)]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.direction == "flat"
        assert result.percent_change == 0.0

    def test_fewer_than_three_sessions_returns_insufficient_data(self) -> None:
        sessions = [_session(0, [(100000, 10)]), _session(7, [(110000, 10)])]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, InsufficientDataResult)
        assert result.session_count == 2

    def test_empty_input_returns_insufficient_data_not_raising(self) -> None:
        result = compute_progression(
            [], ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, InsufficientDataResult)
        assert result.session_count == 0

    def test_warmups_excluded_from_volume(self) -> None:
        sessions = [
            _session(0, [(200000, 1), (100000, 10)], is_warmup_first=True),
            _session(7, [(100000, 10)]),
            _session(14, [(100000, 12)]),
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.starting_value == 1_000_000


class TestComputeProgressionTopWeight:
    def test_uses_heaviest_working_set_per_session(self) -> None:
        sessions = [
            _session(0, [(80000, 8), (100000, 3)]),
            _session(7, [(100000, 5)]),
            _session(14, [(110000, 3)]),
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.TOP_WEIGHT, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.starting_value == 100000
        assert result.current_value == 110000


class TestComputeProgressionE1RM:
    def test_skips_sessions_with_no_valid_e1rm(self) -> None:
        sessions = [
            _session(0, [(100000, 5)]),
            _session(7, [(50000, 20)]),  # reps > 12 — no valid e1RM, session skipped
            _session(14, [(100000, 8)]),
            _session(21, [(110000, 6)]),
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.E1RM, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.session_count == 3


class TestComputeProgressionRepsAtLoad:
    def test_tracks_reps_at_most_frequent_load(self) -> None:
        sessions = [
            _session(0, [(60000, 8)]),
            _session(7, [(60000, 10)]),
            _session(14, [(60000, 12)]),
            _session(21, [(80000, 3)]),  # a different, less frequent load — ignored
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.REPS_AT_LOAD, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.starting_value == 8
        assert result.current_value == 12
        assert result.session_count == 3

    def test_bucketing_treats_near_equal_loads_as_the_same(self) -> None:
        sessions = [
            _session(0, [(60000, 8)]),
            _session(7, [(60400, 10)]),
            _session(14, [(59800, 11)]),
        ]
        result = compute_progression(
            _flatten(sessions), ProgressionMetric.REPS_AT_LOAD, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, ProgressionResult)
        assert result.session_count == 3


class TestGroupBySession:
    def test_groups_by_workout_id_and_sorts_chronologically(self) -> None:
        early = _session(7, [(100000, 5)])
        late = _session(0, [(90000, 5)])
        sessions = group_by_session(late + early)
        assert [d for d, _ in sessions] == [START, START + timedelta(days=7)]

    def test_excludes_warmups(self) -> None:
        session = _session(0, [(150000, 1), (100000, 5)], is_warmup_first=True)
        sessions = group_by_session(session)
        assert len(sessions) == 1
        assert len(sessions[0][1]) == 1


class TestMostFrequentLoadBucket:
    def test_returns_mode_bucket(self) -> None:
        sets = _flatten(
            [
                _session(0, [(60000, 8)]),
                _session(7, [(60000, 10)]),
                _session(14, [(80000, 3)]),
            ]
        )
        assert most_frequent_load_bucket(sets, 2500) == 60000

    def test_empty_input_returns_none(self) -> None:
        assert most_frequent_load_bucket([], 2500) is None
