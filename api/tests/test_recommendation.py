import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers.stub import StubAIService
from app.ai.service import get_ai_service
from app.db.models import Exercise
from app.main import app


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
    client: TestClient, tokens: dict, exercise_id: uuid.UUID, sets: list[dict]
) -> None:
    headers = _auth_headers(tokens)
    workout = client.post("/workouts", headers=headers, json={}).json()
    we = client.post(
        f"/workouts/{workout['id']}/exercises",
        headers=headers,
        json={"exercise_id": str(exercise_id)},
    ).json()
    bulk = client.post(f"/workout-exercises/{we['id']}/sets/bulk", headers=headers, json=sets)
    assert bulk.status_code == 200
    finish = client.post(f"/workouts/{workout['id']}/finish", headers=headers)
    assert finish.status_code == 200


class TestWorkoutRecommendation:
    def test_scheme_matches_hand_computed_values(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"rec-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished(client, tokens, bench_id, [{"load_g": 100000, "reps": 5}])
                resp = client.post(
                    "/ai/workout-recommendation",
                    headers=_auth_headers(tokens),
                    json={"exercise_id": str(bench_id)},
                )
                assert resp.status_code == 200, resp.text
                body = resp.json()
                assert body["exercise_name"] == "Bench Press"
                assert [(s["load"]["grams"], s["reps"]) for s in body["suggested_sets"]] == [
                    (100000, 5),
                    (100000, 5),
                    (100000, 5),
                ]
                assert "100.0 kg" in body["explanation"]
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_top_set_progresses_after_strong_session(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"rec8-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished(client, tokens, bench_id, [{"load_g": 100000, "reps": 8}])
                body = client.post(
                    "/ai/workout-recommendation",
                    headers=_auth_headers(tokens),
                    json={"exercise_id": str(bench_id)},
                ).json()
                assert [(s["load"]["grams"], s["reps"]) for s in body["suggested_sets"]] == [
                    (102500, 5),
                    (102500, 5),
                    (102500, 5),
                ]
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_no_history_returns_empty_scheme_honestly(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"recempty-{uuid.uuid4()}@example.com")
                squat_id = _exercise_id(db_session, "Squat")
                body = client.post(
                    "/ai/workout-recommendation",
                    headers=_auth_headers(tokens),
                    json={"exercise_id": str(squat_id)},
                ).json()
                assert body["suggested_sets"] == []
                assert "log" in body["explanation"].lower()
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_foreign_exercise_returns_404(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                owner = _register(client, f"recown-{uuid.uuid4()}@example.com")
                intruder = _register(client, f"recint-{uuid.uuid4()}@example.com")
                custom = client.post(
                    "/exercises",
                    headers=_auth_headers(owner),
                    json={
                        "muscle_group_id": 1,
                        "name": f"Secret Lift {uuid.uuid4()}",
                        "load_type": "barbell_total",
                    },
                ).json()
                resp = client.post(
                    "/ai/workout-recommendation",
                    headers=_auth_headers(intruder),
                    json={"exercise_id": custom["id"]},
                )
                assert resp.status_code == 404
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_requires_auth(self, db_session: Session) -> None:
        with TestClient(app) as client:
            resp = client.post(
                "/ai/workout-recommendation", json={"exercise_id": str(uuid.uuid4())}
            )
            assert resp.status_code in (401, 403)
