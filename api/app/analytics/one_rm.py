from app.analytics.loads import effective_load_g
from app.analytics.types import LoadType


def estimate_1rm_g(
    load_g: int, reps: int, load_type: LoadType, bodyweight_g: int | None
) -> int | None:
    if reps < 1 or reps > 12:
        return None

    effective_load = effective_load_g(load_g, load_type, bodyweight_g)
    if effective_load <= 0:
        return None

    return round(effective_load * (1 + reps / 30))


def epley_reps_for(target_1rm_g: int, load_g: int) -> float | None:
    if load_g <= 0:
        return None
    return (target_1rm_g / load_g - 1) * 30
