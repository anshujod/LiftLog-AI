from app.analytics.recommendation import SuggestedSet, suggest_sets
from app.analytics.types import LoadType


def test_repeat_top_set_by_default() -> None:
    assert (
        suggest_sets([(100000, 5), (100000, 3)], LoadType.BARBELL_TOTAL, 2500)
        == [SuggestedSet(load_g=100000, reps=5)] * 3
    )


def test_eight_reps_progresses_load() -> None:
    assert (
        suggest_sets([(100000, 8)], LoadType.BARBELL_TOTAL, 2500)
        == [SuggestedSet(load_g=102500, reps=5)] * 3
    )


def test_dumbbell_increment_applies_per_hand() -> None:
    assert (
        suggest_sets([(22500, 10)], LoadType.DUMBBELL_PER_HAND, 2500)
        == [SuggestedSet(load_g=25000, reps=5)] * 3
    )


def test_bodyweight_progresses_reps() -> None:
    assert (
        suggest_sets([(0, 12)], LoadType.BODYWEIGHT, 2500) == [SuggestedSet(load_g=0, reps=13)] * 3
    )


def test_assisted_never_flips_sign() -> None:
    assert (
        suggest_sets([(-10000, 10)], LoadType.ASSISTED, 2500)
        == [SuggestedSet(load_g=-10000, reps=11)] * 3
    )


def test_empty_history_suggests_nothing() -> None:
    assert suggest_sets([], LoadType.BARBELL_TOTAL, 2500) == []


def test_set_count_clamped() -> None:
    assert len(suggest_sets([(100000, 5)], LoadType.BARBELL_TOTAL, 2500, set_count=99)) == 8
    assert len(suggest_sets([(100000, 5)], LoadType.BARBELL_TOTAL, 2500, set_count=0)) == 1
