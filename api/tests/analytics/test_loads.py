import pytest

from app.analytics.loads import MissingBodyweightError, effective_load_g, set_volume_g
from app.analytics.types import LoadType


class TestEffectiveLoad:
    def test_barbell_total(self) -> None:
        assert effective_load_g(100000, LoadType.BARBELL_TOTAL, None) == 100000

    def test_machine_total(self) -> None:
        assert effective_load_g(50000, LoadType.MACHINE_TOTAL, None) == 50000

    def test_dumbbell_per_hand_uses_single_hand_load(self) -> None:
        assert effective_load_g(22500, LoadType.DUMBBELL_PER_HAND, None) == 22500

    def test_bodyweight_uses_bodyweight(self) -> None:
        assert effective_load_g(0, LoadType.BODYWEIGHT, 80000) == 80000

    def test_bodyweight_added(self) -> None:
        assert effective_load_g(10000, LoadType.BODYWEIGHT_ADDED, 80000) == 90000

    def test_assisted_subtracts_via_negative_load(self) -> None:
        assert effective_load_g(-20000, LoadType.ASSISTED, 80000) == 60000

    def test_bodyweight_missing_raises(self) -> None:
        with pytest.raises(MissingBodyweightError):
            effective_load_g(0, LoadType.BODYWEIGHT, None)

    def test_bodyweight_added_missing_raises(self) -> None:
        with pytest.raises(MissingBodyweightError):
            effective_load_g(10000, LoadType.BODYWEIGHT_ADDED, None)

    def test_assisted_missing_raises(self) -> None:
        with pytest.raises(MissingBodyweightError):
            effective_load_g(-10000, LoadType.ASSISTED, None)


class TestSetVolume:
    def test_barbell_total_volume(self) -> None:
        assert set_volume_g(100000, 5, LoadType.BARBELL_TOTAL, None) == 500000

    def test_machine_total_volume(self) -> None:
        assert set_volume_g(50000, 8, LoadType.MACHINE_TOTAL, None) == 400000

    def test_dumbbell_per_hand_doubles_volume(self) -> None:
        # 22.5kg dumbbells x 10 reps = 450,000g of volume, not 225,000g.
        assert set_volume_g(22500, 10, LoadType.DUMBBELL_PER_HAND, None) == 450000

    def test_bodyweight_volume(self) -> None:
        assert set_volume_g(0, 10, LoadType.BODYWEIGHT, 80000) == 800000

    def test_bodyweight_added_volume(self) -> None:
        assert set_volume_g(10000, 5, LoadType.BODYWEIGHT_ADDED, 80000) == 450000

    def test_assisted_pullup_negative_load_produces_positive_sensible_volume(self) -> None:
        # 80kg bodyweight, 20kg of assistance, 8 reps -> 60kg effective x 8 = 480,000g.
        volume = set_volume_g(-20000, 8, LoadType.ASSISTED, 80000)
        assert volume == 480000
        assert volume > 0
