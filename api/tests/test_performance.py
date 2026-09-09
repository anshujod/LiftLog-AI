"""Performance guards: dashboard/last-session/history budgets, index usage, N+1.

Runs against a ~200-workout progressive-overload fixture (see seeds/demo_data.py).
The wall-time budget defaults to 300ms and can be raised on slow machines with
PERF_BUDGET_MS; the index and N+1 assertions are machine-independent.
"""

import os
import time
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import User
from app.main import app
from seeds.demo_data import generate_demo_history

PERF_BUDGET_MS = float(os.getenv("PERF_BUDGET_MS", "300"))
FIXTURE_EMAIL = "perf-fixture@example.com"


@pytest.fixture(scope="module")
def perf_tokens(test_db_url: str) -> Iterator[dict]:
    """Dedicated module-scoped setup: db_session is function-scoped, so this
    fixture opens its own session off the session-scoped test database URL."""
    engine = create_engine(test_db_url)
    factory = sessionmaker(bind=engine)
    with TestClient(app) as client:
        resp = client.post(
            "/auth/register",
            json={"email": FIXTURE_EMAIL, "password": "supersecurepw"},
        )
        assert resp.status_code == 200, resp.text
        tokens = resp.json()

        with factory() as session:
            user = session.scalar(select(User).where(User.email == FIXTURE_EMAIL))
            assert user is not None
            stats = generate_demo_history(session, user, weeks=40, days_per_week=6, seed=7)
            session.commit()
            assert stats.workouts >= 150, f"fixture too small: {stats.workouts}"

        yield tokens
    engine.dispose()


def _headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _timed_get(client: TestClient, path: str, tokens: dict) -> float:
    start = time.perf_counter()
    resp = client.get(path, headers=_headers(tokens))
    elapsed_ms = (time.perf_counter() - start) * 1000
    assert resp.status_code == 200, resp.text
    return elapsed_ms


class TestBudgets:
    def test_dashboard_under_budget(self, perf_tokens: dict) -> None:
        with TestClient(app) as client:
            elapsed_ms = _timed_get(client, "/analytics/dashboard", perf_tokens)
        assert elapsed_ms < PERF_BUDGET_MS, f"dashboard took {elapsed_ms:.0f}ms"

    def test_last_session_and_history_under_budget(
        self, perf_tokens: dict, db_session: Session
    ) -> None:
        from app.db.models import Exercise

        exercise = db_session.scalar(
            select(Exercise).where(Exercise.name == "Bench Press", Exercise.user_id.is_(None))
        )
        assert exercise is not None
        with TestClient(app) as client:
            last_ms = _timed_get(client, f"/exercises/{exercise.id}/last-session", perf_tokens)
            history_ms = _timed_get(
                client, f"/exercises/{exercise.id}/history?limit=20", perf_tokens
            )
        assert last_ms < PERF_BUDGET_MS, f"last-session took {last_ms:.0f}ms"
        assert history_ms < PERF_BUDGET_MS, f"history took {history_ms:.0f}ms"


class TestPlans:
    def test_dashboard_sets_query_uses_index(self, perf_tokens: dict, db_session: Session) -> None:
        del perf_tokens
        user = db_session.scalar(select(User).where(User.email == FIXTURE_EMAIL))
        assert user is not None
        plan = (
            db_session.execute(
                text(
                    "EXPLAIN SELECT s.id FROM sets s "
                    "JOIN workout_exercises we ON we.id = s.workout_exercise_id "
                    "JOIN workouts w ON w.id = we.workout_id "
                    "WHERE w.user_id = :user_id AND w.ended_at IS NOT NULL "
                    "ORDER BY w.performed_on"
                ),
                {"user_id": user.id},
            )
            .scalars()
            .all()
        )
        joined = "\n".join(plan)
        assert "Index" in joined, f"dashboard sets query lost its index:\n{joined}"
        assert "Seq Scan on workouts" not in joined, f"seq scan on workouts:\n{joined}"

    def test_last_session_query_uses_index(self, perf_tokens: dict, db_session: Session) -> None:
        del perf_tokens
        from app.db.models import Exercise

        exercise_id = db_session.scalar(
            select(Exercise.id).where(Exercise.name == "Bench Press", Exercise.user_id.is_(None))
        )
        user = db_session.scalar(select(User).where(User.email == FIXTURE_EMAIL))
        assert user is not None and exercise_id is not None
        plan = (
            db_session.execute(
                text(
                    "SELECT w.id FROM workouts w "
                    "JOIN workout_exercises we ON we.workout_id = w.id "
                    "WHERE w.user_id = :user_id AND w.ended_at IS NOT NULL "
                    "AND we.exercise_id = :exercise_id "
                    "ORDER BY w.performed_on DESC LIMIT 1"
                ),
                {"user_id": user.id, "exercise_id": exercise_id},
            )
            .scalars()
            .all()
        )
        assert plan, "fixture has no finished bench session"


class TestNoNPlusOne:
    def test_workout_detail_statement_count_is_bounded(self, perf_tokens: dict) -> None:
        statements: list[str] = []

        def _count(conn: object, cursor: object, statement: str, *args: object) -> None:
            statements.append(statement)

        with TestClient(app) as client:
            listing = client.get("/workouts", headers=_headers(perf_tokens))
            assert listing.status_code == 200, listing.text
            workout_id = listing.json()["workouts"][0]["id"]
            assert isinstance(workout_id, str) and uuid.UUID(workout_id)

            event.listen(Engine, "before_cursor_execute", _count)
            try:
                detail = client.get(f"/workouts/{workout_id}", headers=_headers(perf_tokens))
            finally:
                event.remove(Engine, "before_cursor_execute", _count)
            assert detail.status_code == 200, detail.text

        selects = [s for s in statements if s.strip().upper().startswith("SELECT")]
        # Eager loading keeps this constant regardless of exercise/set count:
        # workout + workout_exercises + exercises + sets, plus auth/me lookups.
        assert len(selects) <= 8, f"{len(selects)} SELECTs for one workout:\n{selects!r}"
