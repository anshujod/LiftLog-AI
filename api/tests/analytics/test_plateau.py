import uuid
from datetime import date, timedelta

from app.analytics.plateau import PlateauResult, detect_plateau
from app.analytics.types import LoadType, ProgressionMetric, SetRecord

START = date(2026, 1, 1)


def _session(day_offset: int, load_g: int, reps: int = 10) -> list[SetRecord]:
    workout_id = uuid.uuid4()
    performed_on = START + timedelta(days=day_offset)
    return [
        SetRecord(
            load_g=load_g,
            reps=reps,
            is_warmup=False,
            performed_on=performed_on,
            workout_id=workout_id,
        )
    ]


def _flatten(sessions: list[list[SetRecord]]) -> list[SetRecord]:
    return [s for session in sessions for s in session]


class TestDetectPlateau:
    def test_flat_series_over_six_weeks_triggers_plateau(self) -> None:
        sessions = [_session(i * 7, 100000, 10) for i in range(7)]
        result = detect_plateau(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, PlateauResult)
        assert result.session_count == 7
        assert result.window_days >= 42
        assert result.improvement_pct == 0.0

    def test_short_flat_series_does_not_trigger(self) -> None:
        # Only 4 sessions — below the 6-session floor even though genuinely flat.
        sessions = [_session(i * 7, 100000, 10) for i in range(4)]
        result = detect_plateau(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert result is None

    def test_narrow_window_does_not_trigger_even_with_enough_sessions(self) -> None:
        # 6 sessions but bunched within a week — enough count, not enough span.
        sessions = [_session(i, 100000, 10) for i in range(6)]
        result = detect_plateau(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert result is None

    def test_meaningful_improvement_does_not_trigger(self) -> None:
        sessions = [_session(i * 7, 100000 + i * 5000, 10) for i in range(7)]
        result = detect_plateau(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert result is None

    def test_deload_week_does_not_break_the_streak(self) -> None:
        sessions = [
            _session(0, 100000, 10),
            _session(7, 100000, 10),
            _session(14, 30000, 10),  # deload — far under trailing average
            _session(21, 100000, 10),
            _session(28, 100000, 10),
            _session(35, 100000, 10),
            _session(42, 100000, 10),
        ]
        result = detect_plateau(
            _flatten(sessions), ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500
        )
        assert isinstance(result, PlateauResult)
        assert result.session_count == 6

    def test_empty_input_returns_none_not_raising(self) -> None:
        assert (
            detect_plateau([], ProgressionMetric.VOLUME, LoadType.BARBELL_TOTAL, None, 2500) is None
        )
