import uuid
from datetime import date, timedelta

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


def _log_finished_workout(
    client: TestClient,
    tokens: dict,
    exercise_id: uuid.UUID,
    performed_on: date,
    sets: list[dict],
) -> str:
    resp = client.post(
        "/workouts", headers=_auth_headers(tokens), json={"performed_on": performed_on.isoformat()}
    )
    assert resp.status_code == 200
    workout = resp.json()

    we_resp = client.post(
        f"/workouts/{workout['id']}/exercises",
        headers=_auth_headers(tokens),
        json={"exercise_id": str(exercise_id)},
    )
    assert we_resp.status_code == 200
    we = we_resp.json()

    bulk_resp = client.post(
        f"/workout-exercises/{we['id']}/sets/bulk", headers=_auth_headers(tokens), json=sets
    )
    assert bulk_resp.status_code == 200

    finish_resp = client.post(f"/workouts/{workout['id']}/finish", headers=_auth_headers(tokens))
    assert finish_resp.status_code == 200
    return workout["id"]


class TestExerciseProgress:
    def test_linear_improvement_matches_hand_computed_percentage(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"progress-{uuid.uuid4()}@example.com")
            # Tricep Pushdown: machine_total load, "volume" progression metric —
            # volume = load_g * reps with no bodyweight or per-hand doubling involved.
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")
            today = date.today()

            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                today - timedelta(days=14),
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )
            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                today - timedelta(days=7),
                [{"load_g": 44000, "reps": 10, "is_warmup": False}],
            )
            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                today,
                [{"load_g": 48000, "reps": 10, "is_warmup": False}],
            )

            resp = client.get(
                f"/exercises/{pushdown_id}/progress?period=all", headers=_auth_headers(tokens)
            )
            assert resp.status_code == 200
            data = resp.json()

            assert data["metric"] == "volume"
            assert data["has_data"] is True
            assert data["session_count"] == 3
            assert data["starting_value"] == 400_000
            assert data["current_value"] == 480_000
            assert data["absolute_change"] == 80_000
            assert data["percent_change"] == 20.0
            assert data["direction"] == "improving"

    def test_insufficient_data_returns_has_data_false(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"progress-{uuid.uuid4()}@example.com")
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")

            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                date.today(),
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )

            resp = client.get(
                f"/exercises/{pushdown_id}/progress?period=all", headers=_auth_headers(tokens)
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["has_data"] is False
            assert data["session_count"] == 1
            assert data["percent_change"] is None


class TestAnalyticsVolume:
    def test_weekly_buckets_match_hand_computed_totals(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"volume-{uuid.uuid4()}@example.com")
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")
            monday = date.today() - timedelta(days=date.today().weekday())

            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                monday,
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )
            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                monday + timedelta(days=2),
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )

            resp = client.get(
                "/analytics/volume?period=all&granularity=week", headers=_auth_headers(tokens)
            )
            assert resp.status_code == 200
            periods = resp.json()
            assert len(periods) == 1
            assert periods[0]["period_start"] == monday.isoformat()
            assert periods[0]["volume"]["grams"] == 800_000


class TestAnalyticsMuscleGroups:
    def test_groups_and_sums_by_muscle_group(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"muscle-{uuid.uuid4()}@example.com")
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")  # triceps
            row_id = _exercise_id(db_session, "Barbell Row")  # back
            today = date.today()

            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                today,
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )
            _log_finished_workout(
                client, tokens, row_id, today, [{"load_g": 60000, "reps": 10, "is_warmup": False}]
            )

            resp = client.get("/analytics/muscle-groups?period=all", headers=_auth_headers(tokens))
            assert resp.status_code == 200
            by_slug = {g["muscle_group_slug"]: g for g in resp.json()}
            assert by_slug["triceps"]["volume"]["grams"] == 400_000
            assert by_slug["triceps"]["working_set_count"] == 1
            assert by_slug["back"]["volume"]["grams"] == 600_000
            assert by_slug["back"]["working_set_count"] == 1


class TestAnalyticsDashboard:
    def test_workout_count_and_weekly_volume_match_hand_computed_values(
        self, db_session: Session
    ) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"dashboard-{uuid.uuid4()}@example.com")
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")
            today = date.today()
            this_monday = today - timedelta(days=today.weekday())
            last_monday = this_monday - timedelta(days=7)

            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                this_monday,
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )
            _log_finished_workout(
                client,
                tokens,
                pushdown_id,
                last_monday,
                [{"load_g": 20000, "reps": 10, "is_warmup": False}],
            )

            resp = client.get("/analytics/dashboard", headers=_auth_headers(tokens))
            assert resp.status_code == 200
            data = resp.json()

            assert data["workout_count"] == 2
            assert data["weekly_volume"]["current_week"]["grams"] == 400_000
            assert data["weekly_volume"]["previous_week"]["grams"] == 200_000
            assert data["weekly_volume"]["percent_change"] == 100.0
            assert len(data["recent_workouts"]) == 2


class TestAnalyticsPlateaus:
    def test_flat_long_running_exercise_appears_in_plateaus(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"plateau-{uuid.uuid4()}@example.com")
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")
            today = date.today()

            for weeks_ago in reversed(range(7)):  # 7 sessions, one per week, identical volume
                _log_finished_workout(
                    client,
                    tokens,
                    pushdown_id,
                    today - timedelta(weeks=weeks_ago),
                    [{"load_g": 40000, "reps": 10, "is_warmup": False}],
                )

            resp = client.get("/analytics/plateaus", headers=_auth_headers(tokens))
            assert resp.status_code == 200
            plateaus = resp.json()
            assert any(p["exercise_id"] == str(pushdown_id) for p in plateaus)


class TestAnalyticsCrossUserIsolation:
    def test_dashboard_and_plateaus_do_not_leak_between_users(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens_a = _register(client, f"iso-a-{uuid.uuid4()}@example.com")
            tokens_b = _register(client, f"iso-b-{uuid.uuid4()}@example.com")
            pushdown_id = _exercise_id(db_session, "Tricep Pushdown")

            _log_finished_workout(
                client,
                tokens_a,
                pushdown_id,
                date.today(),
                [{"load_g": 40000, "reps": 10, "is_warmup": False}],
            )

            resp_b = client.get("/analytics/dashboard", headers=_auth_headers(tokens_b))
            assert resp_b.status_code == 200
            assert resp_b.json()["workout_count"] == 0
            assert resp_b.json()["recent_workouts"] == []
