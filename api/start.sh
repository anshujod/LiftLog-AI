#!/bin/sh
# Production entrypoint.
# Render Pre-Deploy is paid-only, and we stay on free tier — so migrations
# must run on boot here. The no-op case (already migrated) is ~1s; only real
# schema changes cost more, and those happen on deploys, not cold starts.
# Paid users can set RUN_MIGRATIONS_ON_BOOT=0 + Pre-Deploy `uv run alembic
# upgrade head` for instant bind. Local dev overrides CMD in docker-compose.yml.
set -e
if [ "${RUN_MIGRATIONS_ON_BOOT:-1}" = "1" ]; then
  uv run alembic upgrade head
fi
exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${UVICORN_WORKERS:-2}" --loop uvloop --http httptools --limit-concurrency 40
