import base64
import uuid
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.analytics.loads import set_volume_g
from app.analytics.prs import PRResult, compute_prs
from app.analytics.types import LoadType as AnalyticsLoadType
from app.analytics.types import SetRecord
from app.analytics.units import Unit, format_load
from app.core.errors import NotFoundError, ValidationError
from app.db.models import Exercise, LoadType, Set, User, Workout, WorkoutExercise
from app.repositories import workout_repository
from app.schemas.exercise import ExerciseOut
from app.schemas.load import LoadValue
from app.schemas.workout import (
    FinishSummaryOut,
    NewPROut,
    SetIn,
    SetOut,
    SetUpdate,
    WorkoutCreate,
    WorkoutExerciseCreate,
    WorkoutExerciseOut,
    WorkoutExerciseUpdate,
    WorkoutOut,
    WorkoutsPageOut,
    WorkoutSummaryOut,
    WorkoutUpdate,
)

_LOAD_POSITIVE = (LoadType.BARBELL_TOTAL, LoadType.MACHINE_TOTAL, LoadType.DUMBBELL_PER_HAND)


def create_workout(db: Session, user: User, data: WorkoutCreate) -> WorkoutOut:
    performed_on = data.performed_on or date.today()
    started_at = datetime.now(UTC)
    workout = workout_repository.create(
        db, user.id, performed_on, started_at, data.title, data.notes
    )
    db.commit()
    return _get_workout_out(db, user, workout.id)


def get_workout(db: Session, user: User, workout_id: uuid.UUID) -> WorkoutOut:
    return _get_workout_out(db, user, workout_id)


def update_workout(db: Session, user: User, workout: Workout, data: WorkoutUpdate) -> WorkoutOut:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(workout, field, value)
    db.commit()
    return _get_workout_out(db, user, workout.id)


def delete_workout(db: Session, workout: Workout) -> None:
    workout_repository.delete_workout(db, workout)
    db.commit()


def list_workouts(db: Session, user: User, limit: int, cursor: str | None) -> WorkoutsPageOut:
    before_performed_on, before_workout_id = _decode_cursor(cursor) if cursor else (None, None)
    workouts = workout_repository.list_for_user(
        db, user.id, limit, before_performed_on, before_workout_id
    )
    summaries = [
        WorkoutSummaryOut(
            id=w.id,
            performed_on=w.performed_on,
            started_at=w.started_at,
            ended_at=w.ended_at,
            title=w.title,
            exercise_count=len(w.workout_exercises),
        )
        for w in workouts
    ]
    next_cursor = None
    if len(workouts) == limit and summaries:
        last = summaries[-1]
        next_cursor = _encode_cursor(last.performed_on, last.id)
    return WorkoutsPageOut(workouts=summaries, next_cursor=next_cursor)


def add_workout_exercise(
    db: Session, user: User, workout: Workout, data: WorkoutExerciseCreate
) -> WorkoutExerciseOut:
    exercise = db.get(Exercise, data.exercise_id)
    is_foreign_custom = exercise is not None and exercise.user_id not in (None, user.id)
    if exercise is None or is_foreign_custom:
        raise NotFoundError("Exercise not found")

    workout_exercise = workout_repository.add_exercise(db, workout.id, data.exercise_id, data.notes)
    db.commit()
    db.refresh(workout_exercise)
    return _workout_exercise_out(workout_exercise, _unit(user))


def delete_workout_exercise(db: Session, workout_exercise: WorkoutExercise) -> None:
    workout_repository.delete_workout_exercise(db, workout_exercise)
    db.commit()


def update_workout_exercise(
    db: Session, user: User, workout_exercise: WorkoutExercise, data: WorkoutExerciseUpdate
) -> WorkoutExerciseOut:
    updates = data.model_dump(exclude_unset=True)
    if "notes" in updates:
        workout_exercise.notes = updates["notes"]
    if updates.get("position") is not None:
        workout_repository.reorder_exercise(db, workout_exercise, updates["position"])
    db.commit()
    db.refresh(workout_exercise)
    return _workout_exercise_out(workout_exercise, _unit(user))


def add_set(db: Session, user: User, workout_exercise: WorkoutExercise, data: SetIn) -> SetOut:
    _validate_load(workout_exercise.exercise.load_type, data.load_g, data.reps)
    workout_set = workout_repository.add_set(db, workout_exercise.id, data)
    db.commit()
    return _set_out(workout_set, _unit(user))


def bulk_replace_sets(
    db: Session, user: User, workout_exercise: WorkoutExercise, sets_in: list[SetIn]
) -> list[SetOut]:
    load_type = workout_exercise.exercise.load_type
    for data in sets_in:
        _validate_load(load_type, data.load_g, data.reps)
    created = workout_repository.replace_sets(db, workout_exercise.id, sets_in)
    db.commit()
    unit = _unit(user)
    return [_set_out(s, unit) for s in created]


def update_set(db: Session, user: User, workout_set: Set, data: SetUpdate) -> SetOut:
    updates = data.model_dump(exclude_unset=True)
    load_type = workout_set.workout_exercise.exercise.load_type
    new_load_g = updates.get("load_g", workout_set.load_g)
    new_reps = updates.get("reps", workout_set.reps)
    _validate_load(load_type, new_load_g, new_reps)

    for field, value in updates.items():
        setattr(workout_set, field, value)
    db.commit()
    db.refresh(workout_set)
    return _set_out(workout_set, _unit(user))


def delete_set(db: Session, workout_set: Set) -> None:
    workout_repository.delete_set(db, workout_set)
    db.commit()


def finish_workout(db: Session, user: User, workout: Workout) -> FinishSummaryOut:
    workout.ended_at = datetime.now(UTC)
    db.commit()

    detail = workout_repository.get_with_details(db, workout.id)
    assert detail is not None
    unit = _unit(user)

    exercise_count = len(detail.workout_exercises)
    total_working_sets = 0
    total_volume_g = 0
    new_prs: list[NewPROut] = []
    seen_exercise_ids: set[uuid.UUID] = set()

    for we in detail.workout_exercises:
        exercise = we.exercise
        analytics_load_type = AnalyticsLoadType(exercise.load_type.value)
        working_sets = [s for s in we.sets if not s.is_warmup]
        total_working_sets += len(working_sets)
        total_volume_g += sum(
            set_volume_g(s.load_g, s.reps, analytics_load_type, user.bodyweight_g)
            for s in working_sets
        )

        if exercise.id in seen_exercise_ids:
            continue
        seen_exercise_ids.add(exercise.id)

        rows = workout_repository.get_finished_sets_for_exercise(db, exercise.id, user.id)
        set_records = [
            SetRecord(
                load_g=row[0].load_g,
                reps=row[0].reps,
                is_warmup=row[0].is_warmup,
                performed_on=row[1],
                workout_id=row[2],
            )
            for row in rows
        ]
        result = compute_prs(
            set_records, analytics_load_type, user.bodyweight_g, exercise.default_increment_g
        )
        new_prs.extend(_new_prs_for_exercise(result, exercise, workout.id, unit))

    started_at = detail.started_at or detail.ended_at
    duration_minutes = 0
    if started_at is not None and detail.ended_at is not None:
        duration_minutes = max(0, round((detail.ended_at - started_at).total_seconds() / 60))

    return FinishSummaryOut(
        exercise_count=exercise_count,
        total_working_sets=total_working_sets,
        total_volume=_load_value(total_volume_g, unit),
        duration_minutes=duration_minutes,
        new_prs=new_prs,
    )


def _new_prs_for_exercise(
    result: PRResult, exercise: Exercise, workout_id: uuid.UUID, unit: Unit
) -> list[NewPROut]:
    found: list[NewPROut] = []

    if result.weight_pr is not None and result.weight_pr.set_record.workout_id == workout_id:
        sr = result.weight_pr.set_record
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="weight",
                value=_load_value(sr.load_g, unit),
                reps=sr.reps,
                workout_id=workout_id,
                performed_on=sr.performed_on,
            )
        )

    if result.rep_pr is not None and result.rep_pr.set_record.workout_id == workout_id:
        sr = result.rep_pr.set_record
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="rep",
                value=_load_value(sr.load_g, unit),
                reps=result.rep_pr.value,
                workout_id=workout_id,
                performed_on=sr.performed_on,
            )
        )

    if result.e1rm_pr is not None and result.e1rm_pr.set_record.workout_id == workout_id:
        sr = result.e1rm_pr.set_record
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="e1rm",
                value=_load_value(result.e1rm_pr.value, unit),
                reps=sr.reps,
                workout_id=workout_id,
                performed_on=sr.performed_on,
            )
        )

    if result.session_volume_pr is not None and result.session_volume_pr.workout_id == workout_id:
        svp = result.session_volume_pr
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="session_volume",
                value=_load_value(svp.value, unit),
                reps=None,
                workout_id=workout_id,
                performed_on=svp.performed_on,
            )
        )

    return found


def _validate_load(load_type: LoadType, load_g: int, reps: int) -> None:
    if load_type in _LOAD_POSITIVE and load_g <= 0:
        raise ValidationError("load_g must be greater than 0 for this exercise's load type")
    elif load_type == LoadType.BODYWEIGHT and load_g != 0:
        raise ValidationError("load_g must be 0 for a bodyweight exercise")
    elif load_type == LoadType.BODYWEIGHT_ADDED and load_g < 0:
        raise ValidationError(
            "load_g must be greater than or equal to 0 for a bodyweight-added exercise"
        )
    elif load_type == LoadType.ASSISTED and load_g >= 0:
        raise ValidationError("load_g must be less than 0 for an assisted exercise")

    if not (1 <= reps <= 100):
        raise ValidationError("reps must be between 1 and 100")


def _get_workout_out(db: Session, user: User, workout_id: uuid.UUID) -> WorkoutOut:
    detail = workout_repository.get_with_details(db, workout_id)
    if detail is None or detail.user_id != user.id:
        raise NotFoundError("Workout not found")
    return _workout_out(detail, _unit(user))


def _workout_out(w: Workout, unit: Unit) -> WorkoutOut:
    return WorkoutOut(
        id=w.id,
        performed_on=w.performed_on,
        started_at=w.started_at,
        ended_at=w.ended_at,
        title=w.title,
        notes=w.notes,
        workout_exercises=[
            _workout_exercise_out(we, unit)
            for we in sorted(w.workout_exercises, key=lambda we: we.position)
        ],
    )


def _workout_exercise_out(we: WorkoutExercise, unit: Unit) -> WorkoutExerciseOut:
    return WorkoutExerciseOut(
        id=we.id,
        exercise=ExerciseOut.from_model(we.exercise),
        position=we.position,
        notes=we.notes,
        sets=[_set_out(s, unit) for s in sorted(we.sets, key=lambda s: s.set_number)],
    )


def _set_out(s: Set, unit: Unit) -> SetOut:
    return SetOut(
        id=s.id,
        set_number=s.set_number,
        load=_load_value(s.load_g, unit),
        reps=s.reps,
        is_warmup=s.is_warmup,
        rpe=float(s.rpe) if s.rpe is not None else None,
        notes=s.notes,
    )


def _unit(user: User) -> Unit:
    return "kg" if user.unit_preference.value == "kg" else "lb"


def _load_value(load_g: int, unit: Unit) -> LoadValue:
    return LoadValue(grams=load_g, display=format_load(load_g, unit))


def _encode_cursor(performed_on: date, workout_id: uuid.UUID) -> str:
    raw = f"{performed_on.isoformat()}:{workout_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[date, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        performed_on_str, workout_id_str = raw.split(":", 1)
        return date.fromisoformat(performed_on_str), uuid.UUID(workout_id_str)
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValidationError("Invalid cursor") from exc
