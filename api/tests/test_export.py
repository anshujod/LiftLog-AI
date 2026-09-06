import csv
import io
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

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


class TestExport:
    def test_json_export_round_trips_losslessly(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"exp-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bench_id = _exercise_id(db_session, "Bench Press")

            workout = client.post("/workouts", headers=headers, json={"title": "Chest"}).json()
            we = client.post(
                f"/workouts/{workout['id']}/exercises",
                headers=headers,
                json={"exercise_id": str(bench_id)},
            ).json()
            client.post(
                f"/workout-exercises/{we['id']}/sets/bulk",
                headers=headers,
                json=[
                    {"load_g": 80000, "reps": 5},
                    {"load_g": 80000, "reps": 3, "is_warmup": False},
                ],
            )
            client.post(f"/workouts/{workout['id']}/finish", headers=headers)

            resp = client.get("/export", headers=headers)
            assert resp.status_code == 200, resp.text
            payload = resp.json()
            assert payload["version"] == 1
            assert payload["user"]["unit_preference"] in ("kg", "lb")
            assert len(payload["workouts"]) == 1
            exported_workout = payload["workouts"][0]
            assert exported_workout["title"] == "Chest"
            exported_sets = exported_workout["exercises"][0]["sets"]
            assert [(s["load_g"], s["reps"]) for s in exported_sets] == [
                (80000, 5),
                (80000, 3),
            ]
            # Raw grams preserved for re-import.
            assert all(isinstance(s["load_g"], int) for s in exported_sets)

    def test_csv_export_has_header_and_rows(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"exp-csv-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bench_id = _exercise_id(db_session, "Bench Press")

            workout = client.post("/workouts", headers=headers, json={}).json()
            we = client.post(
                f"/workouts/{workout['id']}/exercises",
                headers=headers,
                json={"exercise_id": str(bench_id)},
            ).json()
            client.post(
                f"/workout-exercises/{we['id']}/sets/bulk",
                headers=headers,
                json=[{"load_g": 60000, "reps": 5}],
            )
            client.post(f"/workouts/{workout['id']}/finish", headers=headers)

            resp = client.get("/export?format=csv", headers=headers)
            assert resp.status_code == 200
            assert "text/csv" in resp.headers["content-type"]
            rows = list(csv.DictReader(io.StringIO(resp.text)))
            assert len(rows) == 1
            assert rows[0]["exercise_name"] == "Bench Press"
            assert rows[0]["load_g"] == "60000"
            assert rows[0]["reps"] == "5"

    def test_export_is_scoped_to_caller(self, db_session: Session) -> None:
        with TestClient(app) as client:
            owner = _register(client, f"exp-owner-{uuid.uuid4()}@example.com")
            other = _register(client, f"exp-other-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")

            workout = client.post(
                "/workouts", headers=_auth_headers(owner), json={"title": "Mine"}
            ).json()
            we = client.post(
                f"/workouts/{workout['id']}/exercises",
                headers=_auth_headers(owner),
                json={"exercise_id": str(bench_id)},
            ).json()
            client.post(
                f"/workout-exercises/{we['id']}/sets/bulk",
                headers=_auth_headers(owner),
                json=[{"load_g": 60000, "reps": 5}],
            )

            other_export = client.get("/export", headers=_auth_headers(other)).json()
            assert other_export["workouts"] == []
