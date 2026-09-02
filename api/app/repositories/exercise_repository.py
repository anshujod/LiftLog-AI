import uuid
from datetime import date

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import Exercise, MuscleGroup, Set, Workout, WorkoutExercise
from app.schemas.exercise import ExerciseCreate


def list_muscle_groups(db: Session) -> list[MuscleGroup]:
    return list(db.scalars(select(MuscleGroup).order_by(MuscleGroup.display_order)))


def list_visible_exercises(
    db: Session,
    user_id: uuid.UUID,
    q: str | None,
    muscle_group_slug: str | None,
    include_custom: bool,
) -> list[Exercise]:
    last_performed = (
        select(
            WorkoutExercise.exercise_id.label("exercise_id"),
            func.max(Workout.performed_on).label("last_performed_on"),
        )
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.user_id == user_id)
        .group_by(WorkoutExercise.exercise_id)
        .subquery()
    )

    stmt = (
        select(Exercise)
        .outerjoin(last_performed, last_performed.c.exercise_id == Exercise.id)
        .where(Exercise.is_active.is_(True))
    )

    if include_custom:
        stmt = stmt.where(or_(Exercise.user_id.is_(None), Exercise.user_id == user_id))
    else:
        stmt = stmt.where(Exercise.user_id.is_(None))

    if muscle_group_slug is not None:
        stmt = stmt.join(MuscleGroup, MuscleGroup.id == Exercise.muscle_group_id).where(
            MuscleGroup.slug == muscle_group_slug
        )

    if q:
        stmt = stmt.where(func.lower(Exercise.name).contains(q.lower()))

    stmt = stmt.order_by(last_performed.c.last_performed_on.desc().nulls_last(), Exercise.name)

    return list(db.scalars(stmt))


def get_by_name_for_user(db: Session, user_id: uuid.UUID, name: str) -> Exercise | None:
    return db.scalar(
        select(Exercise).where(
            or_(Exercise.user_id.is_(None), Exercise.user_id == user_id),
            func.lower(Exercise.name) == name.lower(),
        )
    )


def create_custom(db: Session, user_id: uuid.UUID, data: ExerciseCreate) -> Exercise:
    exercise = Exercise(
        user_id=user_id,
        muscle_group_id=data.muscle_group_id,
        name=data.name,
        load_type=data.load_type,
        progression_metric=data.progression_metric,
        default_increment_g=data.default_increment_g,
    )
    db.add(exercise)
    db.flush()
    return exercise


SetRow = tuple[Set, date, uuid.UUID]


def get_last_completed_session_sets(
    db: Session, exercise_id: uuid.UUID, user_id: uuid.UUID
) -> list[SetRow]:
    latest_workout = (
        select(Workout.id, Workout.performed_on)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .where(
            Workout.user_id == user_id,
            WorkoutExercise.exercise_id == exercise_id,
            Workout.ended_at.is_not(None),
        )
        .order_by(Workout.performed_on.desc(), Workout.ended_at.desc())
        .limit(1)
        .subquery()
    )

    rows = db.execute(
        select(Set, latest_workout.c.performed_on, latest_workout.c.id)
        .select_from(latest_workout)
        .join(WorkoutExercise, WorkoutExercise.workout_id == latest_workout.c.id)
        .join(Set, Set.workout_exercise_id == WorkoutExercise.id)
        .where(WorkoutExercise.exercise_id == exercise_id)
        .order_by(Set.set_number)
    ).all()
    return [(row[0], row[1], row[2]) for row in rows]


def get_all_sets_for_exercise(
    db: Session, exercise_id: uuid.UUID, user_id: uuid.UUID
) -> list[SetRow]:
    rows = db.execute(
        select(Set, Workout.performed_on, Workout.id)
        .join(WorkoutExercise, WorkoutExercise.id == Set.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(WorkoutExercise.exercise_id == exercise_id, Workout.user_id == user_id)
        .order_by(Workout.performed_on.asc(), Workout.created_at.asc(), Set.set_number.asc())
    ).all()
    return [(row[0], row[1], row[2]) for row in rows]


def list_finished_workout_ids_for_exercise(
    db: Session,
    exercise_id: uuid.UUID,
    user_id: uuid.UUID,
    limit: int,
    before_performed_on: date | None,
    before_workout_id: uuid.UUID | None,
) -> list[uuid.UUID]:
    stmt = (
        select(Workout.id, Workout.performed_on)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .where(
            Workout.user_id == user_id,
            WorkoutExercise.exercise_id == exercise_id,
            Workout.ended_at.is_not(None),
        )
        .distinct()
        .order_by(Workout.performed_on.desc(), Workout.id.desc())
        .limit(limit)
    )

    if before_performed_on is not None and before_workout_id is not None:
        stmt = stmt.where(
            or_(
                Workout.performed_on < before_performed_on,
                and_(
                    Workout.performed_on == before_performed_on,
                    Workout.id < before_workout_id,
                ),
            )
        )

    return [row[0] for row in db.execute(stmt)]


def get_sets_for_workouts(
    db: Session, exercise_id: uuid.UUID, workout_ids: list[uuid.UUID]
) -> list[SetRow]:
    rows = db.execute(
        select(Set, Workout.performed_on, Workout.id)
        .join(WorkoutExercise, WorkoutExercise.id == Set.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(WorkoutExercise.exercise_id == exercise_id, Workout.id.in_(workout_ids))
        .order_by(Set.set_number)
    ).all()
    return [(row[0], row[1], row[2]) for row in rows]
