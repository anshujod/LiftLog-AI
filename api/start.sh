#!/bin/sh
# Production entrypoint: migrate first, then serve. No --reload here; local
# development overrides the command in docker-compose.yml instead.
set -e
uv run alembic upgrade head
exec uv run uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
