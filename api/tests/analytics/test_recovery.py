import uuid
from datetime import date, timedelta

from app.analytics.recovery import compute_recovery
from app.analytics.types import ExerciseSetRecord, LoadType

SLUGS = ["chest", "back", "legs", "shoulders", "biceps", "triceps", "abs"]
TODAY = date(2026, 9, 15)


def _set(slug: str, performed_on: date, *, is_warmup: bool = False) -> ExerciseSetRecord:
    return ExerciseSetRecord(
        load_g=60000,
        reps=10,
        is_warmup=is_warmup,
        performed_on=performed_on,
        workout_id=uuid.uuid4(),
        load_type=LoadType.BARBELL_TOTAL,
        muscle_group_slug=slug,
    )


def _by_slug(result):  # type: ignore[no-untyped-def]
    return {r.muscle_group_slug: r for r in result}


class TestComputeRecovery:
    def test_empty_history_reports_all_ready(self) -> None:
        result = compute_recovery([], SLUGS, TODAY)
        assert len(result) == len(SLUGS)
        assert all(r.status == "ready" and r.percent == 100 for r in result)

    def test_fresh_session_reports_rest(self) -> None:
        result = _by_slug(compute_recovery([_set("chest", TODAY)], SLUGS, TODAY))
        assert result["chest"].status == "rest"
        assert result["chest"].last_trained_on == TODAY

    def test_half_window_reports_recovering(self) -> None:
        # Chest window is 48h at neutral volume; 1 day ago -> 24/48 = 50%.
        sets = [_set("chest", TODAY - timedelta(days=1)) for _ in range(6)]
        result = _by_slug(compute_recovery(sets, SLUGS, TODAY))
        assert result["chest"].status == "recovering"
        assert result["chest"].percent == 50

    def test_light_week_shortens_window(self) -> None:
        # 1 set in 7d -> chest window 48h * 0.75 = 36h; 1 day ago = 24/36 = 67%.
        result = _by_slug(
            compute_recovery([_set("chest", TODAY - timedelta(days=1))], SLUGS, TODAY)
        )
        assert result["chest"].status == "recovering"
        assert result["chest"].percent == 67

    def test_full_window_reports_ready(self) -> None:
        result = _by_slug(
            compute_recovery([_set("chest", TODAY - timedelta(days=5))], SLUGS, TODAY)
        )
        assert result["chest"].status == "ready"
        assert result["chest"].percent == 100

    def test_hard_week_extends_window(self) -> None:
        # 12 sets in 7d -> chest window 48h * 1.5 = 72h; 2 days ago = 48/72 = 67%.
        sets = [_set("chest", TODAY - timedelta(days=2)) for _ in range(12)]
        result = _by_slug(compute_recovery(sets, SLUGS, TODAY))
        assert result["chest"].status == "recovering"
        assert result["chest"].percent == 67

    def test_warmups_do_not_set_last_trained(self) -> None:
        result = _by_slug(compute_recovery([_set("back", TODAY, is_warmup=True)], SLUGS, TODAY))
        assert result["back"].status == "ready"
        assert result["back"].last_trained_on is None

    def test_stale_training_reports_ready(self) -> None:
        result = _by_slug(
            compute_recovery([_set("legs", TODAY - timedelta(days=60))], SLUGS, TODAY)
        )
        assert result["legs"].status == "ready"
        assert result["legs"].percent == 100
