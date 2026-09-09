# LiftLog AI

A personal strength-training tracker. Every workout is logged as structured data,
progression is computed deterministically, and an AI layer interprets the numbers
without ever calculating them itself.

> Demo: _record a short GIF of the logging loop on a phone and link it here._

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ web/  Next.js App Router PWA (Vercel)                       │
│   routes, tab shell, /api/auth/* route handlers             │
│   lib/api/  typed fetch client + OpenAPI-generated types    │
│   components/  SetRow, LastSessionPanel, charts, …          │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTPS + JWT
┌──────────────────────────▼──────────────────────────────────┐
│ api/  FastAPI + SQLAlchemy 2.0 + PostgreSQL (Render)        │
│   routers/     HTTP only — validation, auth, status codes   │
│   services/    orchestration, transactions                  │
│   repositories/  SQL via SQLAlchemy                         │
│   analytics/   PURE functions — no I/O, no DB imports       │
│   ai/          LLM interpretation, depends on analytics only │
└─────────────────────────────────────────────────────────────┘
```

Layering is enforced structurally, not by convention: `analytics/` takes typed
inputs and returns typed outputs with zero I/O, and the `ai/` package can only
receive those outputs. It is physically unable to query the database.

### Non-negotiable invariants

- All loads are stored as integer grams; unit conversion happens only at the API boundary.
- Volume math is aware of how each exercise's load is applied (barbell vs. per-hand
  dumbbell vs. bodyweight vs. assisted).
- Warmup sets are excluded from every PR, volume, and progression calculation.
- Estimated 1RM is only computed for sets of 12 reps or fewer.
- The AI layer never computes a number — it receives a typed metrics payload and
  interprets it. Every figure it mentions must already exist in that payload.
- Requesting another user's data returns 404, never 403 — existence is never confirmed.

## Why analytics before AI

Fitness apps that let an LLM do arithmetic hallucinate PRs. LiftLog inverts the
dependency: the deterministic engine (`app/analytics/`, pure functions, >95%
covered) computes every number first — e1RM, PRs, progression, plateaus, volume —
and the model receives them as a typed `MetricsPayload` with explicit units. The
system prompt then states the grounding contract: every numeric claim must appear
verbatim in the payload, unanswerable questions get an honest "I can't tell from
your data," language stays hedged, and computed facts are visually separated from
interpretation in the UI. AI endpoints are rate-limited and every screen renders
its deterministic content with an inline "analysis unavailable" note when the
provider fails — AI is never a hard dependency of a page.

## Grounding and evals

`app/ai/evals/` keeps the model honest with mechanical checks instead of vibes:

- `test_no_hallucinated_numbers` — every numeric token in the output must appear
  in the payload (rounding tolerance allowed). Corrupting a payload makes it fail.
- `test_no_unsupported_claims` — no mentioning exercises absent from the payload.
- `test_hedged_language` — no medical/diagnostic phrasing, no guarantees.
- `test_insufficient_data_honesty` — two sessions must not produce a "trend".
- Scenario cases: improving reads as improving, flat never reads as improving,
  declining is never spun as positive.

Evals run against recorded fixtures (deterministic, no network); a separate
opt-in flag hits the live provider. Token usage is logged per request
(`liftlog.ai` → `llm_usage` events with provider, model, operation, and
input/output tokens), so AI spend is visible by aggregating the logs.

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
make test      # backend test suite (229 tests, coverage gates apply)
make lint      # ruff + mypy
make migrate   # apply database migrations
```

### Frontend

Requirements: the API running locally (`make up`), and Node 20+.

```bash
cd web
npm install
cp .env.local.example .env.local   # defaults already point at localhost:8000
npm run dev
```

The app is served at `http://localhost:3000`, dark mode by default, installable as a PWA.

```bash
npm run gen:api   # regenerate lib/api/schema.d.ts from the running backend's OpenAPI schema
npm test           # vitest: SetRow, LastSessionPanel, offline retry queue
npm run e2e        # Playwright: full logging loop on a mobile viewport (needs API + seed)
npm run lint       # eslint
npm run build      # production build + typecheck
```

`.github/workflows/frontend-ci.yml` regenerates `schema.d.ts` against a freshly built
backend on every PR touching `web/` or `api/` and fails if the working tree comes out
dirty, so a backend schema change can't silently drift from the frontend types.

## Testing

- Backend: `cd api && uv run pytest` — unit, analytics, integration, journey
  (register → log → finish → history → progress → AI → export), performance
  (dashboard/last-session/history budgets against a 200-workout fixture, index
  usage, N+1 guard), and AI evals. Overall coverage ≥ 80%, `analytics/` ≥ 95%,
  both enforced in CI.
- Performance budgets default to 300 ms locally (`PERF_BUDGET_MS` overrides; CI
  uses 1000 ms since shared runners are noisy).
- CI: backend (lint, typecheck, tests, coverage gates), frontend (type drift,
  unit tests, build, Playwright e2e against a seeded compose backend), plus a
  scheduled uptime ping against production.

## Production deployment

API on Render (Docker), web on Vercel, Postgres with automated backups. The image
entrypoint (`api/start.sh`) runs `alembic upgrade head` before serving, so every
deploy migrates itself; local compose overrides the command with `--reload` for dev.

API environment variables (all secrets live here, never in the repo or bundle):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | JWT signing key (long random string) |
| `AI_API_KEY` | Provider key; empty disables AI gracefully (503 → inline "unavailable" notes) |
| `AI_PROVIDER` | `anthropic` (default) or `openrouter` |
| `AI_MODEL` / `AI_BASE_URL` | Model name / compatible-gateway override |
| `CORS_ORIGINS` | Deployed frontend origin only, never `*` (rejected at startup) |
| `ENVIRONMENT` | `production` |
| `PORT` | Set by the platform; defaults to 8000 |

Web environment: `NEXT_PUBLIC_API_BASE_URL` (browser → API) and `API_BASE_URL`
(server route handlers → API), both pointed at the deployed API.

One-off production setup: run migrations (automatic on first deploy via the
entrypoint), then seed the global exercise library once — from `api/` with the
production `DATABASE_URL` in the environment (e.g. a Render shell):

```bash
uv run python -c "import os; from sqlalchemy import create_engine;
from sqlalchemy.orm import sessionmaker; from seeds.seed import run_seed;
e = create_engine(os.environ['DATABASE_URL']); s = sessionmaker(bind=e)();
run_seed(s); s.commit(); print('seeded')"
```

`.github/workflows/uptime.yml` pings `/health` every 10 minutes (generous timeout
for cold starts) and fails loudly through Actions alerts on a non-200.

PWA: installable from the production URL — manifest, 192/512/maskable icons,
service worker caching the app shell, standalone display, safe-area-aware layout.
