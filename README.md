# LiftLog AI

A personal strength-training tracker. Every workout is logged as structured data,
progression is computed deterministically, and an AI layer (added later) interprets
the numbers without ever calculating them itself.

## Architecture

```
api/            FastAPI + SQLAlchemy 2.0 + PostgreSQL backend
  app/
    core/       config, security, auth dependencies, error handling
    db/         SQLAlchemy engine/session and models
    schemas/    Pydantic request/response models
    repositories/  SQL access
    services/   orchestration, transactions
    analytics/  pure functions — no I/O, no imports from services or repositories
    routers/    HTTP endpoints
    ai/         LLM interpretation layer, depends only on analytics output
  alembic/      database migrations
  seeds/        exercise library and fixture data
web/            Next.js PWA frontend (added later)
```

The `analytics/` package takes typed inputs and returns typed outputs with zero I/O.
This keeps every metric unit-testable and keeps the AI layer structurally unable to
reach past computed metrics into raw rows.

### Non-negotiable invariants

- All loads are stored as integer grams; unit conversion happens only at the API boundary.
- Volume math is aware of how each exercise's load is applied (barbell vs. per-hand
  dumbbell vs. bodyweight vs. assisted).
- Warmup sets are excluded from every PR, volume, and progression calculation.
- Estimated 1RM is only computed for sets of 12 reps or fewer.
- The AI layer never computes a number — it receives a typed metrics payload and
  interprets it. Every figure it mentions must already exist in that payload.
- Requesting another user's data returns 404, never 403 — existence is never confirmed.

## Local development

Requirements: Docker, and [uv](https://docs.astral.sh/uv/) for running the API outside
a container.

```bash
cp api/.env.example api/.env   # fill in a real AUTH_SECRET
make up                        # builds and starts Postgres + the API
```

The API is served at `http://localhost:8000`, with interactive docs at `/docs`.

Running the backend without Docker:

```bash
cd api
uv sync
uv run uvicorn app.main:app --reload
```

Other commands:

```bash
make test      # backend test suite
make lint      # ruff + mypy
make migrate   # apply database migrations
```
