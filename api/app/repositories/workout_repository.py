import uuid
from datetime import date, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy import delete as sa_delete
from sqlalchemy.orm import Session, selectinload

from app.db.models import Set, Workout, WorkoutExercise
from app.schemas.workout import SetIn

SetRow = tuple[Set, date, uuid.UUID]


def create(
    db: Session,
    user_id: uuid.UUID,
    performed_on: date,
    started_at: datetime,
    title: str | None,
    notes: str | None,
) -> Workout:
    workout = Workout(
        user_id=user_id,
        performed_on=performed_on,
        started_at=started_at,
        title=title,
        notes=notes,
    )
    db.add(workout)
    db.flush()
    return workout


def get_with_details(db: Session, workout_id: uuid.UUID) -> Workout | None:
    return db.scalar(
        select(Workout)
        .where(Workout.id == workout_id)
        .options(
            selectinload(Workout.workout_exercises).selectinload(WorkoutExercise.exercise),
            selectinload(Workout.workout_exercises).selectinload(WorkoutExercise.sets),
        )
    )


def list_for_user(
    db: Session,
    user_id: uuid.UUID,
    limit: int,
    before_performed_on: date | None,
    before_workout_id: uuid.UUID | None,
) -> list[Workout]:
    stmt = (
        select(Workout)
        .where(Workout.user_id == user_id)
        .options(selectinload(Workout.workout_exercises))
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
    return list(db.scalars(stmt))


def delete_workout(db: Session, workout: Workout) -> None:
    db.delete(workout)


def next_exercise_position(db: Session, workout_id: uuid.UUID) -> int:
    max_position = db.scalar(
        select(func.max(WorkoutExercise.position)).where(WorkoutExercise.workout_id == workout_id)
    )
    return (max_position or 0) + 1


def add_exercise(
    db: Session, workout_id: uuid.UUID, exercise_id: uuid.UUID, notes: str | None
) -> WorkoutExercise:
    position = next_exercise_position(db, workout_id)
    workout_exercise = WorkoutExercise(
        workout_id=workout_id, exercise_id=exercise_id, position=position, notes=notes
    )
    db.add(workout_exercise)
    db.flush()
    return workout_exercise


def delete_workout_exercise(db: Session, workout_exercise: WorkoutExercise) -> None:
    db.delete(workout_exercise)


def reorder_exercise(db: Session, workout_exercise: WorkoutExercise, new_position: int) -> None:
    siblings = list(
        db.scalars(
            select(WorkoutExercise)
            .where(WorkoutExercise.workout_id == workout_exercise.workout_id)
            .order_by(WorkoutExercise.position)
        )
    )
    siblings = [we for we in siblings if we.id != workout_exercise.id]
    index = max(0, min(new_position - 1, len(siblings)))
    siblings.insert(index, workout_exercise)

    # Offset first to sidestep the (workout_id, position) unique constraint mid-reorder.
    for offset, we in enumerate(siblings):
        we.position = -(offset + 1)
    db.flush()
    for offset, we in enumerate(siblings):
        we.position = offset + 1
    db.flush()


def next_set_number(db: Session, workout_exercise_id: uuid.UUID) -> int:
    max_number = db.scalar(
        select(func.max(Set.set_number)).where(Set.workout_exercise_id == workout_exercise_id)
    )
    return (max_number or 0) + 1


def get_sets_for_workout_exercise(db: Session, workout_exercise_id: uuid.UUID) -> list[Set]:
    return list(
        db.scalars(
            select(Set)
            .where(Set.workout_exercise_id == workout_exercise_id)
            .order_by(Set.set_number)
        )
    )


def add_set(db: Session, workout_exercise_id: uuid.UUID, data: SetIn) -> Set:
    set_number = next_set_number(db, workout_exercise_id)
    workout_set = Set(
        workout_exercise_id=workout_exercise_id,
        set_number=set_number,
        load_g=data.load_g,
        reps=data.reps,
        is_warmup=data.is_warmup,
        rpe=data.rpe,
        notes=data.notes,
    )
    db.add(workout_set)
    db.flush()
    return workout_set


def replace_sets(db: Session, workout_exercise_id: uuid.UUID, sets_in: list[SetIn]) -> list[Set]:
    db.execute(sa_delete(Set).where(Set.workout_exercise_id == workout_exercise_id))
    db.flush()
    created: list[Set] = []
    for i, data in enumerate(sets_in, start=1):
        workout_set = Set(
            workout_exercise_id=workout_exercise_id,
            set_number=i,
            load_g=data.load_g,
            reps=data.reps,
            is_warmup=data.is_warmup,
            rpe=data.rpe,
            notes=data.notes,
        )
        db.add(workout_set)
        created.append(workout_set)
    db.flush()
    return created


def delete_set(db: Session, workout_set: Set) -> None:
    workout_exercise_id = workout_set.workout_exercise_id
    db.delete(workout_set)
    db.flush()
    remaining = list(
        db.scalars(
            select(Set)
            .where(Set.workout_exercise_id == workout_exercise_id)
            .order_by(Set.set_number)
        )
    )
    for i, s in enumerate(remaining, start=1):
        if s.set_number != i:
            s.set_number = i
    db.flush()


def get_finished_sets_for_exercise(
    db: Session, exercise_id: uuid.UUID, user_id: uuid.UUID
) -> list[SetRow]:
    rows = db.execute(
        select(Set, Workout.performed_on, Workout.id)
        .join(WorkoutExercise, WorkoutExercise.id == Set.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(
            WorkoutExercise.exercise_id == exercise_id,
            Workout.user_id == user_id,
            Workout.ended_at.is_not(None),
        )
        .order_by(Workout.performed_on.asc(), Workout.created_at.asc(), Set.set_number.asc())
    ).all()
    return [(row[0], row[1], row[2]) for row in rows]
