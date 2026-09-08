"""Full user journey: register → log workout → finish → history → progress → AI.

Guards the core loop against regressions that touch several layers at once.
Uses the deterministic stub AI service, so no network or provider key is needed.
"""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers.stub import StubAIService
from app.ai.service import get_ai_service
from app.db.models import Exercise
from app.main import app


def _register(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": "supersecurepw"})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _global_exercise_id(db_session: Session, name: str) -> str:
    exercise = db_session.scalar(
        select(Exercise).where(Exercise.name == name, Exercise.user_id.is_(None))
    )
    assert exercise is not None, f"missing global exercise {name}"
    assert isinstance(exercise.id, uuid.UUID)
    return str(exercise.id)


def _log_finished_workout(
    client: TestClient,
    tokens: dict,
    performed_on: date,
    lifts: list[tuple[str, list[dict]]],
) -> dict:
    headers = _headers(tokens)
    workout = client.post("/workouts", headers=headers, json={}).json()
    patched = client.patch(
        f"/workouts/{workout['id']}", headers=headers, json={"performed_on": str(performed_on)}
    )
    assert patched.status_code == 200, patched.text
    for exercise_id, sets in lifts:
        we = client.post(
            f"/workouts/{workout['id']}/exercises",
            headers=headers,
            json={"exercise_id": exercise_id},
        )
        assert we.status_code == 200, we.text
        bulk = client.post(
            f"/workout-exercises/{we.json()['id']}/sets/bulk", headers=headers, json=sets
        )
        assert bulk.status_code == 200, bulk.text
    finish = client.post(f"/workouts/{workout['id']}/finish", headers=headers)
    assert finish.status_code == 200, finish.text
    return finish.json()


class TestFullJourney:
    def test_register_to_ai_question(self, db_session: Session) -> None:
        email = f"journey-{uuid.uuid4()}@example.com"
        with TestClient(app) as client:
            tokens = _register(client, email)
            headers = _headers(tokens)
            bench_id = _global_exercise_id(db_session, "Bench Press")
            squat_id = _global_exercise_id(db_session, "Squat")

            # Workout 1: 100kg x 5 x 3 bench (300kg... in grams: 100000*5*3).
            day_one = date.today() - timedelta(days=7)
            summary_one = _log_finished_workout(
                client,
                tokens,
                day_one,
                [
                    (bench_id, [{"load_g": 100000, "reps": 5} for _ in range(3)]),
                    (squat_id, [{"load_g": 120000, "reps": 5} for _ in range(3)]),
                ],
            )
            assert summary_one["total_volume"]["grams"] == 100000 * 5 * 3 + 120000 * 5 * 3
            assert summary_one["exercise_count"] == 2
            # First-ever workout sets the baseline PRs.
            assert len(summary_one["new_prs"]) >= 1

            # Workout 2: heavier bench single — must surface as a new PR.
            summary_two = _log_finished_workout(
                client,
                tokens,
                date.today(),
                [(bench_id, [{"load_g": 110000, "reps": 3} for _ in range(3)])],
            )
            pr_exercises = {pr["exercise_id"] for pr in summary_two["new_prs"]}
            assert bench_id in pr_exercises

            # History shows both workouts, newest first.
            history = client.get("/workouts", headers=headers)
            assert history.status_code == 200, history.text
            assert len(history.json()["workouts"]) == 2

            # Progress reflects two sessions of bench work.
            progress = client.get(f"/exercises/{bench_id}/progress?period=all", headers=headers)
            assert progress.status_code == 200, progress.text
            assert progress.json()["session_count"] == 2

            # Dashboard aggregates the journey.
            dashboard = client.get("/analytics/dashboard", headers=headers)
            assert dashboard.status_code == 200, dashboard.text
            assert dashboard.json()["workout_count"] >= 2

            # The AI can answer a question grounded in the logged data.
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                chat = client.post(
                    "/ai/chat",
                    headers=headers,
                    json={"message": "How much has my bench improved?", "history": []},
                )
            finally:
                app.dependency_overrides.pop(get_ai_service, None)
            assert chat.status_code == 200, chat.text
            body = chat.json()
            assert body["answer"]
            assert len(body["tool_trace"]) >= 1

            # Export round-trips the journey's data.
            export = client.get("/export?format=json", headers=headers)
            assert export.status_code == 200, export.text
            assert len(export.json()["workouts"]) == 2
