import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.payloads import Insight, TrainingSummaryPayload
from app.ai.providers.stub import StubAIService
from app.ai.service import AIService, get_ai_service
from app.core import config as config_module
from app.db.models import Exercise
from app.main import app
from app.repositories import weekly_summary_repository


def _register(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": "supersecurepw"})
    assert resp.status_code == 200
    return resp.json()


def _auth_headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _exercise_id(db_session: Session, name: str) -> uuid.UUID:
    exercise = db_session.scalar(
        select(Exercise).where(Exercise.name == name, Exercise.user_id.is_(None))
    )
    assert exercise is not None
    return exercise.id


def _seed_finished(
    client: TestClient,
    tokens: dict,
    exercise_id: uuid.UUID,
    sets: list[dict],
    performed_on: date | None = None,
) -> None:
    headers = _auth_headers(tokens)
    workout = client.post("/workouts", headers=headers, json={}).json()
    if performed_on is not None:
        patched = client.patch(
            f"/workouts/{workout['id']}", headers=headers, json={"performed_on": str(performed_on)}
        )
        assert patched.status_code == 200
    we = client.post(
        f"/workouts/{workout['id']}/exercises",
        headers=headers,
        json={"exercise_id": str(exercise_id)},
    ).json()
    bulk = client.post(f"/workout-exercises/{we['id']}/sets/bulk", headers=headers, json=sets)
    assert bulk.status_code == 200
    finish = client.post(f"/workouts/{workout['id']}/finish", headers=headers)
    assert finish.status_code == 200


class _CountingStub(StubAIService):
    calls = 0

    def summarize_training(self, payload: TrainingSummaryPayload) -> Insight:
        type(self).calls += 1
        return super().summarize_training(payload)


class TestWeeklySummary:
    def test_numbers_match_hand_computed_values(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"week-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                _seed_finished(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                body = client.get("/ai/weekly-summary", headers=_auth_headers(tokens)).json()
                assert body["workouts_completed"] == 2
                assert body["total_volume"]["grams"] == 80000 * 5 * 2
                assert body["observation"] is not None
                assert body["cached"] is False
                monday = date.fromisocalendar(*date.today().isocalendar()[:2], 1)
                assert body["week_start"] == monday.isoformat()
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_second_read_comes_from_cache(self, db_session: Session) -> None:
        with TestClient(app) as client:
            _CountingStub.calls = 0
            app.dependency_overrides[get_ai_service] = _CountingStub
            try:
                tokens = _register(client, f"cache-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                headers = _auth_headers(tokens)
                first = client.get("/ai/weekly-summary", headers=headers).json()
                second = client.get("/ai/weekly-summary", headers=headers).json()
                assert first["cached"] is False
                assert second["cached"] is True
                assert first["observation"] == second["observation"]
                assert _CountingStub.calls == 1
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_provider_outage_still_returns_numbers(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Force-empty: process env wins over the .env file, so a real local
        # key can never leak a network call into this test.
        monkeypatch.setenv("AI_API_KEY", "")
        config_module.get_settings.cache_clear()
        try:
            with TestClient(app) as client:
                tokens = _register(client, f"down-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                headers = _auth_headers(tokens)
                first = client.get("/ai/weekly-summary", headers=headers).json()
                second = client.get("/ai/weekly-summary", headers=headers).json()
                assert first["observation"] is None
                assert first["model"] is None
                assert first["workouts_completed"] == 1
                assert first["cached"] is False
                assert second["cached"] is False
        finally:
            config_module.get_settings.cache_clear()

    def test_previous_week_scoped_out(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"scope-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                monday = date.fromisocalendar(*date.today().isocalendar()[:2], 1)
                _seed_finished(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}], monday)
                _seed_finished(
                    client,
                    tokens,
                    bench_id,
                    [{"load_g": 80000, "reps": 5}],
                    monday - timedelta(days=1),
                )
                body = client.get("/ai/weekly-summary", headers=_auth_headers(tokens)).json()
                assert body["workouts_completed"] == 1
                assert body["total_volume"]["grams"] == 80000 * 5
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_cross_user_isolation(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                owner = _register(client, f"wown-{uuid.uuid4()}@example.com")
                asker = _register(client, f"wask-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished(client, owner, bench_id, [{"load_g": 200000, "reps": 1}])
                body = client.get("/ai/weekly-summary", headers=_auth_headers(asker)).json()
                assert body["workouts_completed"] == 0
                assert body["total_volume"]["grams"] == 0
                assert body["changes"] == []
                assert body["new_prs"] == []
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_requires_auth(self, db_session: Session) -> None:
        with TestClient(app) as client:
            assert client.get("/ai/weekly-summary").status_code in (401, 403)


class TestWeeklyCacheRepository:
    def test_save_and_read(self, db_session: Session) -> None:
        from app.db.models import User

        user = User(email=f"cache-{uuid.uuid4()}@example.com", password_hash="x")
        db_session.add(user)
        db_session.commit()
        assert weekly_summary_repository.get_cached(db_session, user.id, 2026, 36) is None
        weekly_summary_repository.save(db_session, user.id, 2026, 36, {"cached": False, "n": 1})
        assert weekly_summary_repository.get_cached(db_session, user.id, 2026, 36) == {
            "cached": False,
            "n": 1,
        }
        weekly_summary_repository.save(db_session, user.id, 2026, 36, {"cached": False, "n": 2})
        assert weekly_summary_repository.get_cached(db_session, user.id, 2026, 36)["n"] == 2


def test_stub_satisfies_protocol() -> None:
    service: AIService = StubAIService()
    assert service.model_name == "stub"
