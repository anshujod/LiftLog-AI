import time
import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, Workout
from app.main import app
from app.services import analytics_service
from seeds.demo_data import generate_demo_history


class TestDemoData:
    def test_generates_finished_progressive_history(self, db_session: Session) -> None:
        user = User(
            email=f"demo-{uuid.uuid4()}@example.com",
            password_hash="not-a-real-hash",
            bodyweight_g=80000,
        )
        db_session.add(user)
        db_session.commit()

        stats = generate_demo_history(db_session, user, weeks=8, seed=7)
        db_session.commit()

        assert stats.workouts > 30
        assert stats.sets > stats.workouts * 5

        workouts = db_session.scalars(select(Workout).where(Workout.user_id == user.id)).all()
        assert workouts
        assert all(w.ended_at is not None for w in workouts)
        assert len({w.performed_on for w in workouts}) > 20

        # Later bench sessions trend heavier than early ones.
        from sqlalchemy import select as sa_select

        from app.db.models import Exercise
        from app.repositories import exercise_repository

        bench = db_session.scalar(
            sa_select(Exercise).where(Exercise.name == "Bench Press", Exercise.user_id.is_(None))
        )
        assert bench is not None
        rows = exercise_repository.get_all_sets_for_exercise(db_session, bench.id, user.id)
        working = [r for r in rows if not r[0].is_warmup]
        assert len(working) > 10
        early = sum(r[0].load_g for r in working[:5]) / 5
        late = sum(r[0].load_g for r in working[-5:]) / 5
        assert late > early

    def test_dashboard_runs_against_fixture(self, db_session: Session) -> None:
        user = User(
            email=f"demo-dash-{uuid.uuid4()}@example.com",
            password_hash="not-a-real-hash",
            bodyweight_g=80000,
        )
        db_session.add(user)
        db_session.commit()

        generate_demo_history(db_session, user, weeks=26, seed=42)
        db_session.commit()

        started = time.perf_counter()
        dashboard = analytics_service.get_dashboard(db_session, user)
        elapsed_ms = (time.perf_counter() - started) * 1000

        assert dashboard.workout_count >= 0
        assert dashboard.recent_workouts
        assert dashboard.weekly_volume.current_week.grams >= 0
        # Generous bound for shared CI runners; the production target is <300ms.
        assert elapsed_ms < 5000, f"dashboard took {elapsed_ms:.0f}ms"

        all_workouts = db_session.scalars(select(Workout).where(Workout.user_id == user.id)).all()
        span_days = (
            max(w.performed_on for w in all_workouts) - min(w.performed_on for w in all_workouts)
        ).days
        assert span_days >= 150


class TestDashboardWithBodyweightMoves:
    def test_dashboard_handles_bodyweight_exercises(self, db_session: Session) -> None:
        with TestClient(app) as client:
            reg = client.post(
                "/auth/register",
                json={"email": f"bw-{uuid.uuid4()}@example.com", "password": "supersecurepw"},
            )
            assert reg.status_code == 200
            headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

            patched = client.patch("/me", headers=headers, json={"bodyweight_g": 80000})
            assert patched.status_code == 200

            pullups = next(
                e
                for e in client.get("/exercises", headers=headers).json()
                if e["name"] == "Pull-ups"
            )
            workout = client.post("/workouts", headers=headers, json={}).json()
            we = client.post(
                f"/workouts/{workout['id']}/exercises",
                headers=headers,
                json={"exercise_id": pullups["id"]},
            ).json()
            bulk = client.post(
                f"/workout-exercises/{we['id']}/sets/bulk",
                headers=headers,
                json=[{"load_g": 0, "reps": 8}, {"load_g": 5000, "reps": 6}],
            )
            assert bulk.status_code == 200
            assert (
                client.post(f"/workouts/{workout['id']}/finish", headers=headers).status_code == 200
            )

            dashboard = client.get("/analytics/dashboard", headers=headers)
            assert dashboard.status_code == 200, dashboard.text
            assert dashboard.json()["recent_workouts"]
