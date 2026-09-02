from app.analytics.one_rm import epley_reps_for, estimate_1rm_g
from app.analytics.types import LoadType


class TestEstimate1RM:
    def test_valid_at_twelve_reps(self) -> None:
        result = estimate_1rm_g(100000, 12, LoadType.BARBELL_TOTAL, None)
        assert result is not None
        assert result == round(100000 * (1 + 12 / 30))

    def test_none_above_twelve_reps(self) -> None:
        assert estimate_1rm_g(100000, 13, LoadType.BARBELL_TOTAL, None) is None

    def test_none_at_zero_reps(self) -> None:
        assert estimate_1rm_g(100000, 0, LoadType.BARBELL_TOTAL, None) is None

    def test_none_when_effective_load_is_zero(self) -> None:
        assert estimate_1rm_g(0, 5, LoadType.BODYWEIGHT_ADDED, 0) is None

    def test_none_when_effective_load_is_negative(self) -> None:
        assert estimate_1rm_g(-50000, 5, LoadType.ASSISTED, 40000) is None

    def test_single_rep_uses_epley_formula(self) -> None:
        # Epley (per spec) is effective_load * (1 + reps/30), not a bare pass-through at 1 rep.
        assert estimate_1rm_g(100000, 1, LoadType.BARBELL_TOTAL, None) == round(
            100000 * (1 + 1 / 30)
        )

    def test_monotonic_heavier_load_at_equal_reps_is_always_higher(self) -> None:
        lighter = estimate_1rm_g(80000, 5, LoadType.BARBELL_TOTAL, None)
        heavier = estimate_1rm_g(90000, 5, LoadType.BARBELL_TOTAL, None)
        assert lighter is not None
        assert heavier is not None
        assert heavier > lighter

    def test_dumbbell_uses_per_hand_load_not_doubled(self) -> None:
        result = estimate_1rm_g(22500, 5, LoadType.DUMBBELL_PER_HAND, None)
        assert result == round(22500 * (1 + 5 / 30))


class TestEpleyRepsFor:
    def test_solves_inverse_of_estimate(self) -> None:
        load_g = 80000
        one_rm = estimate_1rm_g(load_g, 5, LoadType.BARBELL_TOTAL, None)
        assert one_rm is not None
        reps = epley_reps_for(one_rm, load_g)
        assert reps is not None
        assert round(reps) == 5

    def test_none_for_zero_load(self) -> None:
        assert epley_reps_for(100000, 0) is None

    def test_none_for_negative_load(self) -> None:
        assert epley_reps_for(100000, -1) is None
