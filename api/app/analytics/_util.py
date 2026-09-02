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
