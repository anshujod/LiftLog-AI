import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Exercise, MuscleGroup, Workout, WorkoutExercise


def get_full_history(db: Session, user_id: uuid.UUID) -> list[Workout]:
    return list(
        db.scalars(
            select(Workout)
            .where(Workout.user_id == user_id)
            .options(
                selectinload(Workout.workout_exercises)
                .selectinload(WorkoutExercise.exercise)
                .selectinload(Exercise.muscle_group),
                selectinload(Workout.workout_exercises).selectinload(WorkoutExercise.sets),
            )
            .order_by(Workout.performed_on.asc(), Workout.created_at.asc())
        )
    )


def get_visible_exercises(db: Session, user_id: uuid.UUID) -> list[Exercise]:
    return list(
        db.scalars(
            select(Exercise)
            .where((Exercise.user_id.is_(None)) | (Exercise.user_id == user_id))
            .options(selectinload(Exercise.muscle_group))
            .order_by(Exercise.name)
        )
    )


def list_muscle_groups(db: Session) -> list[MuscleGroup]:
    return list(db.scalars(select(MuscleGroup).order_by(MuscleGroup.display_order)))
