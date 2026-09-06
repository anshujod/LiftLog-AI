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


def _create_workout(client: TestClient, tokens: dict) -> dict:
    resp = client.post("/workouts", headers=_auth_headers(tokens), json={})
    assert resp.status_code == 200
    return resp.json()


class TestTemplateCrud:
    def test_create_list_get_patch_delete(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"tpl-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bench_id = _exercise_id(db_session, "Bench Press")
            squat_id = _exercise_id(db_session, "Squat")

            created = client.post(
                "/templates",
                headers=headers,
                json={
                    "name": "Push Day",
                    "exercises": [
                        {"exercise_id": str(bench_id), "target_sets": 4},
                        {"exercise_id": str(squat_id)},
                    ],
                },
            )
            assert created.status_code == 200, created.text
            body = created.json()
            assert body["name"] == "Push Day"
            assert [e["position"] for e in body["exercises"]] == [1, 2]
            assert body["exercises"][0]["target_sets"] == 4
            template_id = body["id"]

            listed = client.get("/templates", headers=headers)
            assert listed.status_code == 200
            assert len(listed.json()) == 1
            assert listed.json()[0]["exercise_count"] == 2

            fetched = client.get(f"/templates/{template_id}", headers=headers)
            assert fetched.status_code == 200
            assert fetched.json()["id"] == template_id

            patched = client.patch(
                f"/templates/{template_id}",
                headers=headers,
                json={"name": "Leg Day"},
            )
            assert patched.status_code == 200
            assert patched.json()["name"] == "Leg Day"

            deleted = client.delete(f"/templates/{template_id}", headers=headers)
            assert deleted.status_code == 204
            assert client.get(f"/templates/{template_id}", headers=headers).status_code == 404

    def test_duplicate_name_rejected(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"tpl-dup-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bench_id = _exercise_id(db_session, "Bench Press")

            first = client.post(
                "/templates",
                headers=headers,
                json={"name": "Push Day", "exercises": [{"exercise_id": str(bench_id)}]},
            )
            assert first.status_code == 200
            second = client.post(
                "/templates",
                headers=headers,
                json={"name": "push day", "exercises": []},
            )
            assert second.status_code == 409

    def test_cross_user_isolation_returns_404(self, db_session: Session) -> None:
        with TestClient(app) as client:
            owner = _register(client, f"tpl-owner-{uuid.uuid4()}@example.com")
            intruder = _register(client, f"tpl-intruder-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            created = client.post(
                "/templates",
                headers=_auth_headers(owner),
                json={"name": "Push Day", "exercises": [{"exercise_id": str(bench_id)}]},
            )
            template_id = created.json()["id"]
            intruder_headers = _auth_headers(intruder)
            assert (
                client.get(f"/templates/{template_id}", headers=intruder_headers).status_code == 404
            )
            assert (
                client.patch(
                    f"/templates/{template_id}", headers=intruder_headers, json={"name": "X"}
                ).status_code
                == 404
            )
            assert (
                client.delete(f"/templates/{template_id}", headers=intruder_headers).status_code
                == 404
            )
            assert (
                client.post(
                    f"/workouts/from-template/{template_id}", headers=intruder_headers
                ).status_code
                == 404
            )


class TestFromTemplate:
    def test_template_prefills_working_sets_from_last_session(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"tpl-fill-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bench_id = _exercise_id(db_session, "Bench Press")

            # Log a finished session: 1 warmup + 2 working sets.
            workout = _create_workout(client, tokens)
            we_resp = client.post(
                f"/workouts/{workout['id']}/exercises",
                headers=headers,
                json={"exercise_id": str(bench_id)},
            )
            we_id = we_resp.json()["id"]
            bulk = client.post(
                f"/workout-exercises/{we_id}/sets/bulk",
                headers=headers,
                json=[
                    {"load_g": 40000, "reps": 8, "is_warmup": True},
                    {"load_g": 80000, "reps": 5},
                    {"load_g": 80000, "reps": 5},
                ],
            )
            assert bulk.status_code == 200
            assert (
                client.post(f"/workouts/{workout['id']}/finish", headers=headers).status_code == 200
            )

            template = client.post(
                "/templates",
                headers=headers,
                json={"name": "Chest Day", "exercises": [{"exercise_id": str(bench_id)}]},
            ).json()

            spawned = client.post(f"/workouts/from-template/{template['id']}", headers=headers)
            assert spawned.status_code == 200, spawned.text
            spawned_body = spawned.json()
            assert spawned_body["title"] == "Chest Day"
            assert len(spawned_body["workout_exercises"]) == 1
            prefilled = spawned_body["workout_exercises"][0]["sets"]
            # Warmups excluded: only the 2 working sets carry over.
            assert len(prefilled) == 2
            assert [s["load"]["grams"] for s in prefilled] == [80000, 80000]
            assert [s["set_number"] for s in prefilled] == [1, 2]

    def test_template_with_no_history_spawns_empty_exercise(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"tpl-empty-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            squat_id = _exercise_id(db_session, "Squat")
            template = client.post(
                "/templates",
                headers=headers,
                json={"name": "Leg Day", "exercises": [{"exercise_id": str(squat_id)}]},
            ).json()
            spawned = client.post(f"/workouts/from-template/{template['id']}", headers=headers)
            assert spawned.status_code == 200
            assert spawned.json()["workout_exercises"][0]["sets"] == []


class TestSaveAsTemplate:
    def test_save_workout_as_template(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"tpl-save-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bench_id = _exercise_id(db_session, "Bench Press")
            squat_id = _exercise_id(db_session, "Squat")

            workout = _create_workout(client, tokens)
            for exercise_id in (bench_id, squat_id):
                we = client.post(
                    f"/workouts/{workout['id']}/exercises",
                    headers=headers,
                    json={"exercise_id": str(exercise_id)},
                ).json()
                client.post(
                    f"/workout-exercises/{we['id']}/sets/bulk",
                    headers=headers,
                    json=[{"load_g": 60000, "reps": 5}, {"load_g": 60000, "reps": 5}],
                )
            assert (
                client.post(f"/workouts/{workout['id']}/finish", headers=headers).status_code == 200
            )

            saved = client.post(
                f"/templates/from-workout/{workout['id']}",
                headers=headers,
                json={"name": "Saved Split"},
            )
            assert saved.status_code == 200, saved.text
            body = saved.json()
            assert body["name"] == "Saved Split"
            assert len(body["exercises"]) == 2
            assert body["exercises"][0]["target_sets"] == 2
