from collections.abc import Callable, Iterable


def first_max[T](items: Iterable[T], key: Callable[[T], int | None]) -> tuple[T, int] | None:
    """Return the (item, value) with the highest key value, keeping the first on ties."""
    best_item: T | None = None
    best_value: int | None = None
    for item in items:
        value = key(item)
        if value is None:
            continue
        if best_value is None or value > best_value:
            best_value = value
            best_item = item
    if best_item is None or best_value is None:
        return None
    return best_item, best_value


def bucket_load(load_g: int, increment_g: int) -> int:
    """Round a load to the nearest increment so near-identical loads (60.0 vs 60.4 kg)
    compare as the same working weight."""
    if increment_g <= 0:
        return load_g
    return round(load_g / increment_g) * increment_g
