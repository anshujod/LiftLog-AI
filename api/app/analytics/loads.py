from app.analytics.types import LoadType

_NO_BODYWEIGHT_NEEDED = (LoadType.BARBELL_TOTAL, LoadType.MACHINE_TOTAL, LoadType.DUMBBELL_PER_HAND)


class MissingBodyweightError(Exception):
    pass


def effective_load_g(load_g: int, load_type: LoadType, bodyweight_g: int | None) -> int:
    if load_type in _NO_BODYWEIGHT_NEEDED:
        return load_g

    if bodyweight_g is None:
        raise MissingBodyweightError(
            f"bodyweight_g is required to compute effective load for {load_type.value}"
        )

    if load_type == LoadType.BODYWEIGHT:
        return bodyweight_g

    # BODYWEIGHT_ADDED and ASSISTED both add load_g to bodyweight; load_g is negative for ASSISTED.
    return bodyweight_g + load_g


def set_volume_g(load_g: int, reps: int, load_type: LoadType, bodyweight_g: int | None) -> int:
    if load_type == LoadType.DUMBBELL_PER_HAND:
        return load_g * reps * 2
    return effective_load_g(load_g, load_type, bodyweight_g) * reps
