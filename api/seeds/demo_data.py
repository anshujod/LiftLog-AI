"""Realistic 6-month progressive-overload fixture for one user.

Produces a Push / Pull / Legs program run 6 days per week for 26 weeks
(~156 finished workouts, ~700 exercise slots, ~2000 sets) with steady
load progression, small session-to-session noise, and a deload every
fifth week. Deterministic for a given seed so tests, chart development,
and later evaluation can rely on it.

Usage:
    python -m seeds.demo_data --email demo@example.com --weeks 26 --seed 42

The module exposes `generate_demo_history` for tests. It deletes any
existing workouts for the user first so reruns are idempotent.
"""

from __future__ import annotations

import argparse
import random
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import Exercise, Set, User, Workout, WorkoutExercise

PUSH_DAY: tuple[str, ...] = (
    "Bench Press",
    "Overhead Press",
    "Incline Dumbbell Press",
    "Lateral Raise",
    "Tricep Pushdown",
)

PULL_DAY: tuple[str, ...] = (
    "Barbell Row",
    "Lat Pulldown",
    "Seated Cable Row",
    "Dumbbell Curl",
    "Face Pull",
)

LEGS_DAY: tuple[str, ...] = (
    "Squat",
    "Romanian Deadlift",
    "Leg Press",
    "Leg Curl",
    "Calf Raises",
)

ROTATION: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Push", PUSH_DAY),
    ("Pull", PULL_DAY),
    ("Legs", LEGS_DAY),
)

# Starting working loads in grams and weekly increments. Per-hand dumbbell
# values are per dumbbell; volume math doubles them downstream.
BASE_LOAD_G: dict[str, int] = {
    "Bench Press": 60000,
    "Overhead Press": 40000,
    "Incline Dumbbell Press": 22000,
    "Lateral Raise": 10000,
    "Tricep Pushdown": 30000,
    "Barbell Row": 60000,
    "Lat Pulldown": 55000,
    "Seated Cable Row": 50000,
    "Dumbbell Curl": 14000,
    "Face Pull": 25000,
    "Squat": 80000,
    "Romanian Deadlift": 90000,
    "Leg Press": 120000,
    "Leg Curl": 40000,
    "Calf Raises": 60000,
}

WEEKLY_INCREMENT_G: dict[str, int] = {
    "Bench Press": 1250,
    "Overhead Press": 1000,
    "Incline Dumbbell Press": 500,
    "Lateral Raise": 250,
    "Tricep Pushdown": 1000,
    "Barbell Row": 1250,
    "Lat Pulldown": 1250,
    "Seated Cable Row": 1000,
    "Dumbbell Curl": 250,
    "Face Pull": 500,
    "Squat": 1500,
    "Romanian Deadlift": 1500,
    "Leg Press": 2500,
    "Leg Curl": 1000,
    "Calf Raises": 1000,
}

COMPOUND_REPS = (5, 6, 8)
ISOLATION_REPS = (10, 12)


@dataclass
class DemoStats:
    workouts: int
    workout_exercises: int
    sets: int


def generate_demo_history(
    session: Session,
    user: User,
    start: date | None = None,
    weeks: int = 26,
    days_per_week: int = 6,
    seed: int = 42,
) -> DemoStats:
    rng = random.Random(seed)
    end = date.today()
    start = start or (end - timedelta(weeks=weeks))

    exercises = _load_exercises(session)
    _clear_user_workouts(session, user.id)
    if user.bodyweight_g is None:
        user.bodyweight_g = 80000
        session.flush()

    workout_count = 0
    exercise_count = 0
    set_count = 0

    # Spread training days evenly across each week with one rest day (Sunday).
    # 6 training days x N weeks lands near 150 workouts for the default window.
    day_offset = 0
    for week in range(weeks):
        is_deload = week % 5 == 4
        for day_in_week in range(days_per_week):
            performed_on = start + timedelta(weeks=week, days=day_in_week)
            if performed_on > end:
                break
            # Skip Sundays to model a real rest day.
            if performed_on.weekday() == 6:
                continue
            day_name, day_exercises = ROTATION[(week * days_per_week + day_in_week) % 3]
            started_at = datetime(
                performed_on.year,
                performed_on.month,
                performed_on.day,
                18,
                0,
                tzinfo=UTC,
            )
            workout = Workout(
                user_id=user.id,
                performed_on=performed_on,
                started_at=started_at,
                ended_at=started_at + timedelta(minutes=60 + rng.randint(0, 30)),
                title=f"{day_name} Day",
                notes=None,
            )
            session.add(workout)
            session.flush()
            workout_count += 1

            for position, name in enumerate(day_exercises, start=1):
                exercise = exercises[name]
                workout_exercise = WorkoutExercise(
                    workout_id=workout.id,
                    exercise_id=exercise.id,
                    position=position,
                    notes=None,
                )
                session.add(workout_exercise)
                session.flush()
                exercise_count += 1

                planned = _planned_sets(rng, name, week, position == 1, is_deload, day_offset)
                for set_number, (load_g, reps, is_warmup) in enumerate(planned, start=1):
                    session.add(
                        Set(
                            workout_exercise_id=workout_exercise.id,
                            set_number=set_number,
                            load_g=load_g,
                            reps=reps,
                            is_warmup=is_warmup,
                            rpe=round(rng.uniform(7.0, 9.0), 1),
                            notes=None,
                        )
                    )
                    set_count += 1
            day_offset += 1

    session.flush()
    return DemoStats(workouts=workout_count, workout_exercises=exercise_count, sets=set_count)


def _load_exercises(session: Session) -> dict[str, Exercise]:
    names: Sequence[str] = tuple(BASE_LOAD_G)
    rows = session.scalars(
        select(Exercise).where(
            Exercise.user_id.is_(None),
            func.lower(Exercise.name).in_([n.lower() for n in names]),
        )
    ).all()
    by_lower = {e.name.lower(): e for e in rows}
    missing = [n for n in names if n.lower() not in by_lower]
    if missing:
        raise RuntimeError(f"Missing global exercises for demo fixture: {missing}")
    return {n: by_lower[n.lower()] for n in names}


def _clear_user_workouts(session: Session, user_id: uuid.UUID) -> None:
    workout_ids = list(session.scalars(select(Workout.id).where(Workout.user_id == user_id)))
    if not workout_ids:
        return
    we_ids = list(
        session.scalars(
            select(WorkoutExercise.id).where(WorkoutExercise.workout_id.in_(workout_ids))
        )
    )
    if we_ids:
        session.execute(delete(Set).where(Set.workout_exercise_id.in_(we_ids)))
    session.execute(delete(WorkoutExercise).where(WorkoutExercise.workout_id.in_(workout_ids)))
    session.execute(delete(Workout).where(Workout.id.in_(workout_ids)))
    session.flush()


def _planned_sets(
    rng: random.Random,
    name: str,
    week: int,
    is_first_exercise: bool,
    is_deload: bool,
    day_offset: int,
) -> list[tuple[int, int, bool]]:
    base = BASE_LOAD_G[name]
    increment = WEEKLY_INCREMENT_G[name]
    # Gentle linear progression with small deterministic wobble so charts
    # slope upward without looking synthetic.
    wobble = (day_offset % 3 - 1) * (increment // 2)
    load = base + week * increment + wobble + rng.randint(-500, 500)
    load = max(2500, _round_to_plate(load))
    if is_deload:
        load = max(2500, _round_to_plate(int(load * 0.6)))

    is_compound = name in (
        "Bench Press",
        "Overhead Press",
        "Barbell Row",
        "Squat",
        "Romanian Deadlift",
    )
    if is_compound:
        reps_options: tuple[int, ...] = COMPOUND_REPS
        working_sets = 2 if is_deload else 3 + (week % 2)
    else:
        reps_options = ISOLATION_REPS
        working_sets = 2 if is_deload else 3

    planned: list[tuple[int, int, bool]] = []
    if is_first_exercise and is_compound and not is_deload:
        planned.append((load // 2, reps_options[0], True))
    for _ in range(working_sets):
        reps = rng.choice(reps_options)
        # Later sets of the day occasionally drop a rep, like real fatigue.
        if planned and rng.random() < 0.2 and reps > reps_options[0]:
            reps -= 1
        planned.append((load, reps, False))
    return planned


def _round_to_plate(load_g: int, plate_g: int = 500) -> int:
    return max(plate_g, round(load_g / plate_g) * plate_g)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate 6-month demo training history")
    parser.add_argument("--email", default="demo@example.com")
    parser.add_argument("--weeks", type=int, default=26)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    from app.core.security import hash_password
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == args.email))
        if user is None:
            user = User(
                email=args.email,
                password_hash=hash_password("supersecurepw"),
                bodyweight_g=80000,
            )
            session.add(user)
            session.flush()
        stats = generate_demo_history(session, user, weeks=args.weeks, seed=args.seed)
        session.commit()
    print(
        f"Demo history: {stats.workouts} workouts, "
        f"{stats.workout_exercises} exercises, {stats.sets} sets."
    )


if __name__ == "__main__":
    main()
