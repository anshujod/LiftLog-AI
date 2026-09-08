from collections.abc import Sequence
from dataclasses import dataclass

from app.analytics.types import LoadType

_DEFAULT_SET_COUNT = 3
_MAX_SET_COUNT = 8


@dataclass(frozen=True, slots=True)
class SuggestedSet:
    load_g: int
    reps: int


def suggest_sets(
    recent_working_sets: Sequence[tuple[int, int]],
    load_type: LoadType,
    default_increment_g: int,
    set_count: int = _DEFAULT_SET_COUNT,
) -> list[SuggestedSet]:
    """Deterministic next-session scheme from the last session's working sets.

    Each item is (load_g, reps); history is assumed already validated, so the
    output preserves the exercise's load sign by construction. Rules:

    - No history → no suggestion. Never invent a starting load.
    - Top set hit 8+ reps on a positive load (anything but assisted) → add one
      increment and drop to 5 reps: the standard small-plate progression.
    - Bodyweight (load 0) → same load, one more rep: progression lives in reps.
    - Assisted at 8+ reps → same assistance, one more rep: reducing assistance
      is left to the lifter, the scheme never flips the load sign.
    - Otherwise → repeat the top set. Consolidation before progression.
    """
    count = max(1, min(set_count, _MAX_SET_COUNT))
    if not recent_working_sets:
        return []
    anchor_load, anchor_reps = max(recent_working_sets, key=lambda item: (item[0], item[1]))

    if anchor_reps >= 8 and anchor_load > 0 and load_type != LoadType.ASSISTED:
        target = SuggestedSet(load_g=anchor_load + default_increment_g, reps=5)
    elif anchor_load == 0:
        target = SuggestedSet(load_g=0, reps=min(anchor_reps + 1, 20))
    elif load_type == LoadType.ASSISTED and anchor_reps >= 8:
        target = SuggestedSet(load_g=anchor_load, reps=min(anchor_reps + 1, 12))
    else:
        target = SuggestedSet(load_g=anchor_load, reps=anchor_reps)
    return [target] * count
