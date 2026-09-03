import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Exercise
from app.main import app

CHEST_MUSCLE_GROUP_ID = 1


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


def _add_exercise(
    client: TestClient, tokens: dict, workout_id: str, exercise_id: uuid.UUID
) -> dict:
    resp = client.post(
        f"/workouts/{workout_id}/exercises",
        headers=_auth_headers(tokens),
        json={"exercise_id": str(exercise_id)},
    )
    assert resp.status_code == 200
    return resp.json()


def _bulk_sets(
    client: TestClient, tokens: dict, workout_exercise_id: str, sets: list[dict]
) -> dict:
    resp = client.post(
        f"/workout-exercises/{workout_exercise_id}/sets/bulk",
        headers=_auth_headers(tokens),
        json=sets,
    )
    assert resp.status_code == 200
    return resp.json()


class TestWorkoutEndToEnd:
    def test_create_add_bulk_save_finish_matches_hand_computed_volume(
        self, db_session: Session
    ) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"e2e-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            deadlift_id = _exercise_id(db_session, "Deadlift")
            db_bench_id = _exercise_id(db_session, "Dumbbell Bench Press")

            workout = _create_workout(client, tokens)

            we_bench = _add_exercise(client, tokens, workout["id"], bench_id)
            we_deadlift = _add_exercise(client, tokens, workout["id"], deadlift_id)
            we_db_bench = _add_exercise(client, tokens, workout["id"], db_bench_id)

            _bulk_sets(
                client,
                tokens,
                we_bench["id"],
                [
                    {"load_g": 50000, "reps": 5, "is_warmup": True},
                    {"load_g": 100000, "reps": 5, "is_warmup": False},
                    {"load_g": 100000, "reps": 3, "is_warmup": False},
                ],
            )
            _bulk_sets(client, tokens, we_deadlift["id"], [{"load_g": 150000, "reps": 5}])
            _bulk_sets(client, tokens, we_db_bench["id"], [{"load_g": 20000, "reps": 10}])

            finish = client.post(f"/workouts/{workout['id']}/finish", headers=_auth_headers(tokens))
            assert finish.status_code == 200
            summary = finish.json()

            expected_volume = (100000 * 5 + 100000 * 3) + (150000 * 5) + (20000 * 10 * 2)
            assert summary["exercise_count"] == 3
            assert summary["total_working_sets"] == 4
            assert summary["total_volume"]["grams"] == expected_volume
            assert summary["duration_minutes"] >= 0
            assert len(summary["new_prs"]) > 0

    def test_second_workout_beating_prior_reports_pr_non_improving_reports_none(
        self, db_session: Session
    ) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"pr-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")

            workout_a = _create_workout(client, tokens)
            we_a = _add_exercise(client, tokens, workout_a["id"], bench_id)
            _bulk_sets(client, tokens, we_a["id"], [{"load_g": 100000, "reps": 5}])
            finish_a = client.post(
                f"/workouts/{workout_a['id']}/finish", headers=_auth_headers(tokens)
            )
            assert finish_a.status_code == 200
            assert any(pr["pr_type"] == "weight" for pr in finish_a.json()["new_prs"])

            workout_b = _create_workout(client, tokens)
            we_b = _add_exercise(client, tokens, workout_b["id"], bench_id)
            _bulk_sets(client, tokens, we_b["id"], [{"load_g": 120000, "reps": 5}])
            finish_b = client.post(
                f"/workouts/{workout_b['id']}/finish", headers=_auth_headers(tokens)
            )
            assert finish_b.status_code == 200
            body_b = finish_b.json()
            assert any(pr["pr_type"] == "weight" for pr in body_b["new_prs"])
            assert body_b["new_prs"][0]["value"]["grams"] == 120000

            workout_c = _create_workout(client, tokens)
            we_c = _add_exercise(client, tokens, workout_c["id"], bench_id)
            _bulk_sets(client, tokens, we_c["id"], [{"load_g": 80000, "reps": 5}])
            finish_c = client.post(
                f"/workouts/{workout_c['id']}/finish", headers=_auth_headers(tokens)
            )
            assert finish_c.status_code == 200
            assert finish_c.json()["new_prs"] == []


class TestLoadValidation:
    def test_barbell_load_must_be_positive(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"validate-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            workout = _create_workout(client, tokens)
            we = _add_exercise(client, tokens, workout["id"], bench_id)

            resp = client.post(
                f"/workout-exercises/{we['id']}/sets",
                headers=_auth_headers(tokens),
                json={"load_g": 0, "reps": 5},
            )
            assert resp.status_code == 422

    def test_reps_out_of_range_rejected(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"reps-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            workout = _create_workout(client, tokens)
            we = _add_exercise(client, tokens, workout["id"], bench_id)

            resp = client.post(
                f"/workout-exercises/{we['id']}/sets",
                headers=_auth_headers(tokens),
                json={"load_g": 100000, "reps": 101},
            )
            assert resp.status_code == 422

    def test_assisted_load_must_be_negative(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"assisted-{uuid.uuid4()}@example.com")
            created = client.post(
                "/exercises",
                headers=_auth_headers(tokens),
                json={
                    "muscle_group_id": CHEST_MUSCLE_GROUP_ID,
                    "name": f"Assisted Dip {uuid.uuid4()}",
                    "load_type": "assisted",
                },
            )
            assert created.status_code == 200
            assisted_id = created.json()["id"]

            workout = _create_workout(client, tokens)
            we = _add_exercise(client, tokens, workout["id"], assisted_id)

            resp = client.post(
                f"/workout-exercises/{we['id']}/sets",
                headers=_auth_headers(tokens),
                json={"load_g": 5000, "reps": 5},
            )
            assert resp.status_code == 422


class TestSetRenumbering:
    def test_delete_set_renumbers_remaining_contiguously(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"renumber-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            workout = _create_workout(client, tokens)
            we = _add_exercise(client, tokens, workout["id"], bench_id)

            sets = _bulk_sets(
                client,
                tokens,
                we["id"],
                [
                    {"load_g": 80000, "reps": 5},
                    {"load_g": 90000, "reps": 5},
                    {"load_g": 100000, "reps": 5},
                ],
            )
            middle_id = sets[1]["id"]

            del_resp = client.delete(f"/sets/{middle_id}", headers=_auth_headers(tokens))
            assert del_resp.status_code == 204

            workout_resp = client.get(f"/workouts/{workout['id']}", headers=_auth_headers(tokens))
            remaining = workout_resp.json()["workout_exercises"][0]["sets"]
            assert [s["set_number"] for s in remaining] == [1, 2]
            assert [s["load"]["grams"] for s in remaining] == [80000, 100000]

    def test_bulk_replace_is_atomic_and_renumbers_from_one(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"bulk-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            workout = _create_workout(client, tokens)
            we = _add_exercise(client, tokens, workout["id"], bench_id)

            _bulk_sets(
                client,
                tokens,
                we["id"],
                [{"load_g": 80000, "reps": 5}, {"load_g": 90000, "reps": 5}],
            )
            second = _bulk_sets(client, tokens, we["id"], [{"load_g": 100000, "reps": 3}])
            assert len(second) == 1
            assert second[0]["set_number"] == 1
            assert second[0]["load"]["grams"] == 100000


class TestWorkoutExerciseReorder:
    def test_patch_position_reorders_siblings(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"reorder-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            deadlift_id = _exercise_id(db_session, "Deadlift")
            squat_id = _exercise_id(db_session, "Squat")

            workout = _create_workout(client, tokens)
            we1 = _add_exercise(client, tokens, workout["id"], bench_id)
            we2 = _add_exercise(client, tokens, workout["id"], deadlift_id)
            we3 = _add_exercise(client, tokens, workout["id"], squat_id)
            assert [we1["position"], we2["position"], we3["position"]] == [1, 2, 3]

            resp = client.patch(
                f"/workout-exercises/{we3['id']}",
                headers=_auth_headers(tokens),
                json={"position": 1},
            )
            assert resp.status_code == 200
            assert resp.json()["position"] == 1

            workout_resp = client.get(f"/workouts/{workout['id']}", headers=_auth_headers(tokens))
            ordered = workout_resp.json()["workout_exercises"]
            assert [we["id"] for we in ordered] == [we3["id"], we1["id"], we2["id"]]
            assert [we["position"] for we in ordered] == [1, 2, 3]


class TestWorkoutDeleteCascade:
    def test_deleting_workout_cascades_to_exercises_and_sets(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"cascade-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")
            workout = _create_workout(client, tokens)
            we = _add_exercise(client, tokens, workout["id"], bench_id)
            sets = _bulk_sets(client, tokens, we["id"], [{"load_g": 100000, "reps": 5}])
            set_id = sets[0]["id"]

            del_resp = client.delete(f"/workouts/{workout['id']}", headers=_auth_headers(tokens))
            assert del_resp.status_code == 204

            get_resp = client.get(f"/workouts/{workout['id']}", headers=_auth_headers(tokens))
            assert get_resp.status_code == 404

            from app.db.models import Set, WorkoutExercise

            assert db_session.get(WorkoutExercise, uuid.UUID(we["id"])) is None
            assert db_session.get(Set, uuid.UUID(set_id)) is None


class TestCrossUserAccess:
    def test_every_workout_route_rejects_cross_user_access(self, db_session: Session) -> None:
        with TestClient(app) as client:
            owner_tokens = _register(client, f"cross-owner-{uuid.uuid4()}@example.com")
            intruder_tokens = _register(client, f"cross-intruder-{uuid.uuid4()}@example.com")
            bench_id = _exercise_id(db_session, "Bench Press")

            workout = _create_workout(client, owner_tokens)
            we = _add_exercise(client, owner_tokens, workout["id"], bench_id)
            sets = _bulk_sets(client, owner_tokens, we["id"], [{"load_g": 100000, "reps": 5}])
            set_id = sets[0]["id"]

            intruder = _auth_headers(intruder_tokens)
            workout_id = workout["id"]
            we_id = we["id"]

            assert client.get(f"/workouts/{workout_id}", headers=intruder).status_code == 404
            assert (
                client.patch(
                    f"/workouts/{workout_id}", headers=intruder, json={"title": "x"}
                ).status_code
                == 404
            )
            assert client.delete(f"/workouts/{workout_id}", headers=intruder).status_code == 404
            assert (
                client.post(f"/workouts/{workout_id}/finish", headers=intruder).status_code == 404
            )
            assert (
                client.post(
                    f"/workouts/{workout_id}/exercises",
                    headers=intruder,
                    json={"exercise_id": str(bench_id)},
                ).status_code
                == 404
            )
            assert (
                client.patch(
                    f"/workout-exercises/{we_id}", headers=intruder, json={"notes": "x"}
                ).status_code
                == 404
            )
            assert (
                client.post(
                    f"/workout-exercises/{we_id}/sets",
                    headers=intruder,
                    json={"load_g": 100000, "reps": 5},
                ).status_code
                == 404
            )
            assert (
                client.post(
                    f"/workout-exercises/{we_id}/sets/bulk",
                    headers=intruder,
                    json=[{"load_g": 100000, "reps": 5}],
                ).status_code
                == 404
            )
            assert client.delete(f"/workout-exercises/{we_id}", headers=intruder).status_code == 404
            assert (
                client.patch(f"/sets/{set_id}", headers=intruder, json={"reps": 3}).status_code
                == 404
            )
            assert client.delete(f"/sets/{set_id}", headers=intruder).status_code == 404
