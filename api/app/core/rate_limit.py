"""Fixed-window rate limiting per client IP, scoped by route prefix.

A small equivalent of slowapi, kept in-house so limits stay deterministic in
tests (see `enabled` and `reset`) and rejections reuse the standard error
envelope with a request id. Counters live in memory, which is correct for a
single-process personal deployment; revisit with a shared store only if the
API ever runs behind multiple replicas.
"""

import threading
import time

AUTH_SCOPE = "/auth"
AI_SCOPE = "/ai"

# (max requests, window seconds) per scope.
LIMITS: dict[str, tuple[int, int]] = {
    AUTH_SCOPE: (5, 60),
    AI_SCOPE: (30, 60),
}

_enabled = True
_lock = threading.Lock()
_hits: dict[tuple[str, str], list[float]] = {}


def set_enabled(value: bool) -> None:
    global _enabled
    _enabled = value


def reset() -> None:
    with _lock:
        _hits.clear()


def scope_for_path(path: str) -> str | None:
    for scope in LIMITS:
        if path == scope or path.startswith(scope + "/"):
            return scope
    return None


def check(client_ip: str, scope: str, now: float | None = None) -> tuple[bool, float]:
    """Return (allowed, retry_after_seconds). Always allows when disabled."""
    if not _enabled:
        return True, 0.0
    limit, window = LIMITS[scope]
    moment = now if now is not None else time.monotonic()
    key = (scope, client_ip)
    with _lock:
        timestamps = [stamp for stamp in _hits.get(key, []) if moment - stamp < window]
        if len(timestamps) >= limit:
            retry_after = max(0.0, window - (moment - timestamps[0]))
            _hits[key] = timestamps
            return False, retry_after
        timestamps.append(moment)
        _hits[key] = timestamps
        return True, 0.0
