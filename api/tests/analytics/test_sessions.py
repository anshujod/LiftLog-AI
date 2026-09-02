import uuid
from datetime import date

from app.analytics.sessions import (
    ExerciseSummary,
    SessionSummary,
    summarize_exercise,
    summarize_session,
)
from app.analytics.types import LoadType, SetRecord

WORKOUT = uuid.uuid4()
DAY = date(2026, 1, 1)


def _set(load_g: int, reps: int, *, is_warmup: bool = False) -> SetRecord:
    return SetRecord(
        load_g=load_g, reps=reps, is_warmup=is_warmup, performed_on=DAY, workout_id=WORKOUT
    )


class TestSummarizeSession:
    def test_empty_sets_returns_none(self) -> None:
        assert summarize_session([], LoadType.BARBELL_TOTAL, None) is None

    def test_basic_summary(self) -> None:
        sets = [_set(100000, 5, is_warmup=True), _set(100000, 5), _set(110000, 3)]
        summary = summarize_session(sets, LoadType.BARBELL_TOTAL, None)
        assert summary is not None
        assert summary.workout_id == WORKOUT
        assert summary.performed_on == DAY
        assert summary.working_set_count == 2
        assert summary.total_volume_g == 100000 * 5 + 110000 * 3
        assert summary.top_set is not None
        assert summary.top_set.load_g == 110000
        assert summary.best_e1rm_g is not None

    def test_warmups_excluded_from_volume_and_working_count(self) -> None:
        sets = [_set(200000, 10, is_warmup=True)]
        summary = summarize_session(sets, LoadType.BARBELL_TOTAL, None)
        assert summary is not None
        assert summary.working_set_count == 0
        assert summary.total_volume_g == 0
        assert summary.top_set is None
        assert summary.best_e1rm_g is None


class TestSummarizeExercise:
    def test_empty_sessions_returns_empty_result_not_raising(self) -> None:
        summary = summarize_exercise([])
        assert summary == ExerciseSummary(
            session_count=0, lifetime_volume_g=0, best_e1rm_g=None, best_weight_g=None
        )

    def test_aggregates_across_sessions(self) -> None:
        sessions = [
            SessionSummary(
                workout_id=uuid.uuid4(),
                performed_on=date(2026, 1, 1),
                total_volume_g=500000,
                top_set=_set(100000, 5),
                working_set_count=3,
                best_e1rm_g=110000,
            ),
            SessionSummary(
                workout_id=uuid.uuid4(),
                performed_on=date(2026, 1, 8),
                total_volume_g=600000,
                top_set=_set(105000, 5),
                working_set_count=3,
                best_e1rm_g=115000,
            ),
        ]
        summary = summarize_exercise(sessions)
        assert summary.session_count == 2
        assert summary.lifetime_volume_g == 1100000
        assert summary.best_e1rm_g == 115000
        assert summary.best_weight_g == 105000

    def test_sessions_with_no_top_set_do_not_break_best_weight(self) -> None:
        sessions = [
            SessionSummary(
                workout_id=uuid.uuid4(),
                performed_on=DAY,
                total_volume_g=0,
                top_set=None,
                working_set_count=0,
                best_e1rm_g=None,
            )
        ]
        summary = summarize_exercise(sessions)
        assert summary.best_weight_g is None
        assert summary.best_e1rm_g is None
