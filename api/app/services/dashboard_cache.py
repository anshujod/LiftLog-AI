"""Tiny per-process TTL cache for GET /analytics/dashboard.

Mobile home fires dashboard + workouts + /me in a burst on every navigation;
without a cache each burst rescans the user's full history in Python. 30s TTL
collapses bursts to one computation while staying fresh enough for training
data (a finish explicitly invalidates). No Redis on free tier — process-local
is enough; multi-replica staleness is bounded by the TTL.
"""

import threading
import time
import uuid

_DASHBOARD_TTL_SECONDS = 30.0

_cache: dict[uuid.UUID, tuple[float, object]] = {}
_lock = threading.Lock()


def get(user_id: uuid.UUID) -> object | None:
    now = time.monotonic()
    with _lock:
        entry = _cache.get(user_id)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at <= now:
            _cache.pop(user_id, None)
            return None
        return value


def put(user_id: uuid.UUID, value: object) -> None:
    with _lock:
        _cache[user_id] = (time.monotonic() + _DASHBOARD_TTL_SECONDS, value)


def invalidate(user_id: uuid.UUID) -> None:
    with _lock:
        _cache.pop(user_id, None)
