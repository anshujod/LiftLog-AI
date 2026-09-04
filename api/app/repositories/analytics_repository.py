import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Exercise, MuscleGroup, Set, Workout, WorkoutExercise

UserSetRow = tuple[Set, date, uuid.UUID, Exercise, str]
"""(set, performed_on, workout_id, exercise, muscle_group_slug)"""


def get_all_sets_for_user(db: Session, user_id: uuid.UUID) -> list[UserSetRow]:
    """Every set from every *finished* workout the user has ever logged, joined
    with the exercise and muscle group context needed to aggregate across
    exercises. Personal-scale data — filtering/grouping by period happens in
    Python rather than adding query variants per period."""
    rows = db.execute(
        select(Set, Workout.performed_on, Workout.id, Exercise, MuscleGroup.slug)
        .join(WorkoutExercise, WorkoutExercise.id == Set.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .join(Exercise, Exercise.id == WorkoutExercise.exercise_id)
        .join(MuscleGroup, MuscleGroup.id == Exercise.muscle_group_id)
        .where(Workout.user_id == user_id, Workout.ended_at.is_not(None))
        .order_by(Workout.performed_on.asc(), Workout.created_at.asc(), Set.set_number.asc())
    ).all()
    return [(row[0], row[1], row[2], row[3], row[4]) for row in rows]


def get_finished_workouts_for_user(db: Session, user_id: uuid.UUID) -> list[Workout]:
    return list(
        db.scalars(
            select(Workout)
            .where(Workout.user_id == user_id, Workout.ended_at.is_not(None))
            .options(selectinload(Workout.workout_exercises))
            .order_by(Workout.performed_on.desc())
        )
    )
