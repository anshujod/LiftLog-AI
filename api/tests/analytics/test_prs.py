import uuid
from datetime import date

from app.analytics.prs import compute_prs, e1rm_pr, rep_pr, session_volume_pr, weight_pr
from app.analytics.types import LoadType, SetRecord

WORKOUT_A = uuid.uuid4()
WORKOUT_B = uuid.uuid4()
DAY_1 = date(2026, 1, 1)
DAY_2 = date(2026, 1, 8)


def _set(
    load_g: int, reps: int, *, is_warmup: bool = False, workout_id=WORKOUT_A, performed_on=DAY_1
) -> SetRecord:
    return SetRecord(
        load_g=load_g,
        reps=reps,
        is_warmup=is_warmup,
        performed_on=performed_on,
        workout_id=workout_id,
    )


class TestWeightPR:
    def test_picks_heaviest_non_warmup_set(self) -> None:
        sets = [_set(60000, 5, is_warmup=True), _set(100000, 3), _set(80000, 5)]
        result = weight_pr(sets)
        assert result is not None
        assert result.value == 100000

    def test_ignores_warmups_entirely(self) -> None:
        sets = [_set(200000, 1, is_warmup=True), _set(100000, 5)]
        result = weight_pr(sets)
        assert result is not None
        assert result.value == 100000

    def test_ties_resolve_to_earliest_occurrence(self) -> None:
        first = _set(100000, 5, performed_on=DAY_1)
        second = _set(100000, 8, performed_on=DAY_2)
        result = weight_pr([first, second])
        assert result is not None
        assert result.set_record is first

    def test_empty_input_returns_none(self) -> None:
        assert weight_pr([]) is None

    def test_all_warmups_returns_none(self) -> None:
        assert weight_pr([_set(100000, 5, is_warmup=True)]) is None


class TestE1RMPR:
    def test_picks_highest_valid_estimate(self) -> None:
        sets = [_set(100000, 20), _set(90000, 5), _set(80000, 8)]
        result = e1rm_pr(sets, LoadType.BARBELL_TOTAL, None)
        assert result is not None
        assert result.set_record.load_g == 90000

    def test_skips_sets_with_no_valid_estimate(self) -> None:
        sets = [_set(150000, 20)]
        assert e1rm_pr(sets, LoadType.BARBELL_TOTAL, None) is None


class TestRepPR:
    def test_bucketing_treats_near_equal_loads_as_same_load(self) -> None:
        sets = [_set(60000, 8), _set(60400, 10)]
        result = rep_pr(sets, default_increment_g=2500)
        assert result is not None
        assert result.value == 10

    def test_distinct_buckets_kept_separate(self) -> None:
        sets = [_set(60000, 12), _set(100000, 3)]
        result = rep_pr(sets, default_increment_g=2500)
        assert result is not None
        assert result.value == 12

    def test_ignores_warmups(self) -> None:
        sets = [_set(60000, 20, is_warmup=True), _set(60000, 8)]
        result = rep_pr(sets, default_increment_g=2500)
        assert result is not None
        assert result.value == 8

    def test_empty_input_returns_none(self) -> None:
        assert rep_pr([], default_increment_g=2500) is None

    def test_non_positive_increment_falls_back_to_exact_load(self) -> None:
        sets = [_set(60000, 8), _set(60000, 10)]
        result = rep_pr(sets, default_increment_g=0)
        assert result is not None
        assert result.value == 10


class TestSessionVolumePR:
    def test_picks_highest_single_session_volume(self) -> None:
        sets = [
            _set(100000, 5, workout_id=WORKOUT_A, performed_on=DAY_1),
            _set(100000, 5, workout_id=WORKOUT_A, performed_on=DAY_1),
            _set(100000, 5, workout_id=WORKOUT_B, performed_on=DAY_2),
        ]
        result = session_volume_pr(sets, LoadType.BARBELL_TOTAL, None)
        assert result is not None
        assert result.workout_id == WORKOUT_A
        assert result.value == 1000000

    def test_excludes_warmups_from_volume(self) -> None:
        sets = [
            _set(200000, 5, is_warmup=True, workout_id=WORKOUT_A),
            _set(100000, 5, workout_id=WORKOUT_A),
        ]
        result = session_volume_pr(sets, LoadType.BARBELL_TOTAL, None)
        assert result is not None
        assert result.value == 500000

    def test_empty_input_returns_none(self) -> None:
        assert session_volume_pr([], LoadType.BARBELL_TOTAL, None) is None


class TestComputePRs:
    def test_empty_input_returns_all_none_not_raising(self) -> None:
        result = compute_prs([], LoadType.BARBELL_TOTAL, None, default_increment_g=2500)
        assert result.weight_pr is None
        assert result.rep_pr is None
        assert result.e1rm_pr is None
        assert result.session_volume_pr is None

    def test_populates_all_four_pr_types(self) -> None:
        sets = [
            _set(100000, 5, workout_id=WORKOUT_A, performed_on=DAY_1),
            _set(100000, 5, workout_id=WORKOUT_A, performed_on=DAY_1),
        ]
        result = compute_prs(sets, LoadType.BARBELL_TOTAL, None, default_increment_g=2500)
        assert result.weight_pr is not None
        assert result.rep_pr is not None
        assert result.e1rm_pr is not None
        assert result.session_volume_pr is not None
