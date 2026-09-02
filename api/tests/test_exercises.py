import uuid
from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Exercise, Set, Workout, WorkoutExercise
from app.main import app

CHEST_MUSCLE_GROUP_ID = 1


def _register(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": "supersecurepw"})
    assert resp.status_code == 200
    return resp.json()


def _auth_headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _user_id(client: TestClient, tokens: dict) -> uuid.UUID:
    resp = client.get("/me", headers=_auth_headers(tokens))
    assert resp.status_code == 200
    return uuid.UUID(resp.json()["id"])


def _bench_press_id(db_session: Session) -> uuid.UUID:
    exercise = db_session.scalar(
        select(Exercise).where(Exercise.name == "Bench Press", Exercise.user_id.is_(None))
    )
    assert exercise is not None
    return exercise.id


def _add_workout(
    db_session: Session,
    user_id: uuid.UUID,
    exercise_id: uuid.UUID,
    performed_on: date,
    sets: list[tuple[int, int, bool]],
    *,
    finished: bool,
) -> Workout:
    workout = Workout(
        user_id=user_id,
        performed_on=performed_on,
        started_at=datetime.now(UTC),
        ended_at=datetime.now(UTC) if finished else None,
    )
    db_session.add(workout)
    db_session.flush()

    workout_exercise = WorkoutExercise(workout_id=workout.id, exercise_id=exercise_id, position=1)
    db_session.add(workout_exercise)
    db_session.flush()

    for i, (load_g, reps, is_warmup) in enumerate(sets, start=1):
        db_session.add(
            Set(
                workout_exercise_id=workout_exercise.id,
                set_number=i,
                load_g=load_g,
                reps=reps,
                is_warmup=is_warmup,
            )
        )
    db_session.commit()
    return workout


class TestExerciseVisibilityAcrossUsers:
    def test_overlapping_custom_names_do_not_leak_between_users(self) -> None:
        with TestClient(app) as client:
            tokens_a = _register(client, f"a-{uuid.uuid4()}@example.com")
            tokens_b = _register(client, f"b-{uuid.uuid4()}@example.com")

            create_a = client.post(
                "/exercises",
                headers=_auth_headers(tokens_a),
                json={
                    "muscle_group_id": CHEST_MUSCLE_GROUP_ID,
                    "name": "My Special Curl",
                    "load_type": "dumbbell_per_hand",
                },
            )
            assert create_a.status_code == 200

            create_b = client.post(
                "/exercises",
                headers=_auth_headers(tokens_b),
                json={
                    "muscle_group_id": CHEST_MUSCLE_GROUP_ID,
                    "name": "My Special Curl",
                    "load_type": "barbell_total",
                },
            )
            assert create_b.status_code == 200
            assert create_a.json()["id"] != create_b.json()["id"]

            list_a = client.get(
                "/exercises", headers=_auth_headers(tokens_a), params={"q": "My Special Curl"}
            ).json()
            list_b = client.get(
                "/exercises", headers=_auth_headers(tokens_b), params={"q": "My Special Curl"}
            ).json()

            assert len(list_a) == 1
            assert list_a[0]["id"] == create_a.json()["id"]
            assert list_a[0]["load_type"] == "dumbbell_per_hand"

            assert len(list_b) == 1
            assert list_b[0]["id"] == create_b.json()["id"]
            assert list_b[0]["load_type"] == "barbell_total"

    def test_duplicate_name_for_same_user_rejected(self) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"dup-ex-{uuid.uuid4()}@example.com")
            payload = {
                "muscle_group_id": CHEST_MUSCLE_GROUP_ID,
                "name": "Unique Curl Name",
                "load_type": "barbell_total",
            }
            first = client.post("/exercises", headers=_auth_headers(tokens), json=payload)
            assert first.status_code == 200
            second = client.post("/exercises", headers=_auth_headers(tokens), json=payload)
            assert second.status_code == 409

    def test_cannot_patch_global_exercise(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"patch-global-{uuid.uuid4()}@example.com")
            bench_id = _bench_press_id(db_session)
            resp = client.patch(
                f"/exercises/{bench_id}",
                headers=_auth_headers(tokens),
                json={"name": "Hacked Bench"},
            )
            assert resp.status_code == 404

    def test_cannot_patch_other_users_custom_exercise(self) -> None:
        with TestClient(app) as client:
            tokens_a = _register(client, f"owner-{uuid.uuid4()}@example.com")
            tokens_b = _register(client, f"intruder-{uuid.uuid4()}@example.com")

            created = client.post(
                "/exercises",
                headers=_auth_headers(tokens_a),
                json={
                    "muscle_group_id": CHEST_MUSCLE_GROUP_ID,
                    "name": f"Owner Lift {uuid.uuid4()}",
                    "load_type": "barbell_total",
                },
            )
            exercise_id = created.json()["id"]

            resp = client.patch(
                f"/exercises/{exercise_id}",
                headers=_auth_headers(tokens_b),
                json={"name": "Stolen"},
            )
            assert resp.status_code == 404


class TestLastSession:
    def test_never_performed_returns_empty_not_error(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"never-{uuid.uuid4()}@example.com")
            bench_id = _bench_press_id(db_session)
            resp = client.get(f"/exercises/{bench_id}/last-session", headers=_auth_headers(tokens))
            assert resp.status_code == 200
            body = resp.json()
            assert body["has_data"] is False
            assert body["session"] is None

    def test_ignores_in_progress_workout_and_returns_last_finished(
        self, db_session: Session
    ) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"inprogress-{uuid.uuid4()}@example.com")
            user_id = _user_id(client, tokens)
            bench_id = _bench_press_id(db_session)

            _add_workout(
                db_session, user_id, bench_id, date(2026, 1, 1), [(100000, 5, False)], finished=True
            )
            # Later by date, but never finished — must not win.
            _add_workout(
                db_session,
                user_id,
                bench_id,
                date(2026, 1, 8),
                [(999000, 1, False)],
                finished=False,
            )

            resp = client.get(f"/exercises/{bench_id}/last-session", headers=_auth_headers(tokens))
            assert resp.status_code == 200
            body = resp.json()
            assert body["has_data"] is True
            assert body["session"]["performed_on"] == "2026-01-01"
            assert body["session"]["sets"][0]["load"]["grams"] == 100000

    def test_returns_most_recent_finished_session_with_correct_volume(
        self, db_session: Session
    ) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"lastsession-{uuid.uuid4()}@example.com")
            user_id = _user_id(client, tokens)
            bench_id = _bench_press_id(db_session)

            _add_workout(
                db_session, user_id, bench_id, date(2026, 1, 1), [(90000, 5, False)], finished=True
            )
            _add_workout(
                db_session,
                user_id,
                bench_id,
                date(2026, 1, 8),
                [(50000, 5, True), (100000, 5, False), (100000, 3, False)],
                finished=True,
            )

            resp = client.get(f"/exercises/{bench_id}/last-session", headers=_auth_headers(tokens))
            body = resp.json()
            assert body["session"]["performed_on"] == "2026-01-08"
            assert body["session"]["working_set_count"] == 2
            assert body["session"]["volume"]["grams"] == 100000 * 5 + 100000 * 3
            assert body["bests"]["weight_pr"]["load"]["grams"] == 100000


class TestHistoryPagination:
    def test_cursor_pagination_across_pages(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"history-{uuid.uuid4()}@example.com")
            user_id = _user_id(client, tokens)
            bench_id = _bench_press_id(db_session)

            for day in (1, 8, 15):
                _add_workout(
                    db_session,
                    user_id,
                    bench_id,
                    date(2026, 1, day),
                    [(80000, 5, False)],
                    finished=True,
                )

            first_page = client.get(
                f"/exercises/{bench_id}/history",
                headers=_auth_headers(tokens),
                params={"limit": 2},
            ).json()
            assert [s["performed_on"] for s in first_page["sessions"]] == [
                "2026-01-15",
                "2026-01-08",
            ]
            assert first_page["next_cursor"] is not None

            second_page = client.get(
                f"/exercises/{bench_id}/history",
                headers=_auth_headers(tokens),
                params={"limit": 2, "cursor": first_page["next_cursor"]},
            ).json()
            assert [s["performed_on"] for s in second_page["sessions"]] == ["2026-01-01"]
            assert second_page["next_cursor"] is None
