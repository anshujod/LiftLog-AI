import base64
import uuid
from collections import defaultdict
from datetime import date

from sqlalchemy.orm import Session

from app.analytics.prs import compute_prs
from app.analytics.sessions import summarize_session
from app.analytics.types import LoadType as AnalyticsLoadType
from app.analytics.types import SetRecord
from app.analytics.units import Unit, format_load
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.db.models import Exercise, MuscleGroup, Set, User
from app.repositories import exercise_repository
from app.repositories.exercise_repository import SetRow
from app.schemas.exercise import ExerciseCreate, ExerciseUpdate
from app.schemas.load import LoadValue
from app.schemas.pr import E1RMPROut, ExercisePRsOut, RepPROut, SessionVolumePROut, WeightPROut
from app.schemas.session import HistoryPageOut, LastSessionOut, SessionOut, SetOut


def list_muscle_groups(db: Session) -> list[MuscleGroup]:
    return exercise_repository.list_muscle_groups(db)


def list_exercises(
    db: Session,
    user: User,
    q: str | None,
    muscle_group: str | None,
    include_custom: bool,
) -> list[Exercise]:
    return exercise_repository.list_visible_exercises(db, user.id, q, muscle_group, include_custom)


def create_exercise(db: Session, user: User, data: ExerciseCreate) -> Exercise:
    if exercise_repository.get_by_name_for_user(db, user.id, data.name) is not None:
        raise ConflictError("An exercise with this name already exists")
    exercise = exercise_repository.create_custom(db, user.id, data)
    db.commit()
    return exercise


def update_exercise(db: Session, user: User, exercise: Exercise, data: ExerciseUpdate) -> Exercise:
    if exercise.user_id != user.id:
        raise NotFoundError("Exercise not found")

    updates = data.model_dump(exclude_unset=True)
    new_name = updates.get("name")
    if (
        new_name is not None
        and new_name.lower() != exercise.name.lower()
        and exercise_repository.get_by_name_for_user(db, user.id, new_name) is not None
    ):
        raise ConflictError("An exercise with this name already exists")

    for field, value in updates.items():
        setattr(exercise, field, value)

    db.commit()
    db.refresh(exercise)
    return exercise


def get_last_session(db: Session, user: User, exercise: Exercise) -> LastSessionOut:
    unit = _unit(user)
    load_type = AnalyticsLoadType(exercise.load_type.value)

    rows = exercise_repository.get_last_completed_session_sets(db, exercise.id, user.id)
    bests = _compute_bests(db, user, exercise)

    if not rows:
        return LastSessionOut(has_data=False, session=None, bests=bests)

    performed_on = rows[0][1]
    workout_id = rows[0][2]
    set_records = [_to_set_record(row) for row in rows]
    summary = summarize_session(set_records, load_type, user.bodyweight_g)
    assert summary is not None

    session_out = SessionOut(
        workout_id=workout_id,
        performed_on=performed_on,
        sets=[_set_out(row[0], unit) for row in sorted(rows, key=lambda r: r[0].set_number)],
        volume=_load_value(summary.total_volume_g, unit),
        working_set_count=summary.working_set_count,
        best_e1rm=_load_value(summary.best_e1rm_g, unit)
        if summary.best_e1rm_g is not None
        else None,
    )
    return LastSessionOut(has_data=True, session=session_out, bests=bests)


def get_prs(db: Session, user: User, exercise: Exercise) -> ExercisePRsOut:
    return _compute_bests(db, user, exercise)


def get_history(
    db: Session, user: User, exercise: Exercise, limit: int, cursor: str | None
) -> HistoryPageOut:
    unit = _unit(user)
    load_type = AnalyticsLoadType(exercise.load_type.value)

    before_performed_on, before_workout_id = _decode_cursor(cursor) if cursor else (None, None)

    workout_ids = exercise_repository.list_finished_workout_ids_for_exercise(
        db, exercise.id, user.id, limit, before_performed_on, before_workout_id
    )
    if not workout_ids:
        return HistoryPageOut(sessions=[], next_cursor=None)

    rows = exercise_repository.get_sets_for_workouts(db, exercise.id, workout_ids)
    rows_by_workout: dict[uuid.UUID, list[SetRow]] = defaultdict(list)
    for row in rows:
        rows_by_workout[row[2]].append(row)

    sessions: list[SessionOut] = []
    for workout_id in workout_ids:
        workout_rows = rows_by_workout.get(workout_id, [])
        set_records = [_to_set_record(row) for row in workout_rows]
        summary = summarize_session(set_records, load_type, user.bodyweight_g)
        if summary is None:
            continue
        sessions.append(
            SessionOut(
                workout_id=summary.workout_id,
                performed_on=summary.performed_on,
                sets=[
                    _set_out(row[0], unit)
                    for row in sorted(workout_rows, key=lambda r: r[0].set_number)
                ],
                volume=_load_value(summary.total_volume_g, unit),
                working_set_count=summary.working_set_count,
                best_e1rm=(
                    _load_value(summary.best_e1rm_g, unit)
                    if summary.best_e1rm_g is not None
                    else None
                ),
            )
        )

    next_cursor = None
    if len(workout_ids) == limit and sessions:
        last = sessions[-1]
        next_cursor = _encode_cursor(last.performed_on, last.workout_id)

    return HistoryPageOut(sessions=sessions, next_cursor=next_cursor)


def _compute_bests(db: Session, user: User, exercise: Exercise) -> ExercisePRsOut:
    unit = _unit(user)
    load_type = AnalyticsLoadType(exercise.load_type.value)

    rows = exercise_repository.get_all_sets_for_exercise(db, exercise.id, user.id)
    set_records = [_to_set_record(row) for row in rows]

    result = compute_prs(set_records, load_type, user.bodyweight_g, exercise.default_increment_g)

    weight_pr_out = None
    if result.weight_pr is not None:
        sr = result.weight_pr.set_record
        weight_pr_out = WeightPROut(
            load=_load_value(sr.load_g, unit),
            reps=sr.reps,
            workout_id=sr.workout_id,
            performed_on=sr.performed_on,
        )

    rep_pr_out = None
    if result.rep_pr is not None:
        sr = result.rep_pr.set_record
        rep_pr_out = RepPROut(
            reps=result.rep_pr.value,
            load=_load_value(sr.load_g, unit),
            workout_id=sr.workout_id,
            performed_on=sr.performed_on,
        )

    e1rm_pr_out = None
    if result.e1rm_pr is not None:
        sr = result.e1rm_pr.set_record
        e1rm_pr_out = E1RMPROut(
            estimated_1rm=_load_value(result.e1rm_pr.value, unit),
            load=_load_value(sr.load_g, unit),
            reps=sr.reps,
            workout_id=sr.workout_id,
            performed_on=sr.performed_on,
        )

    session_volume_pr_out = None
    if result.session_volume_pr is not None:
        svp = result.session_volume_pr
        session_volume_pr_out = SessionVolumePROut(
            volume=_load_value(svp.value, unit),
            workout_id=svp.workout_id,
            performed_on=svp.performed_on,
        )

    return ExercisePRsOut(
        weight_pr=weight_pr_out,
        rep_pr=rep_pr_out,
        e1rm_pr=e1rm_pr_out,
        session_volume_pr=session_volume_pr_out,
    )


def _to_set_record(row: SetRow) -> SetRecord:
    set_row, performed_on, workout_id = row
    return SetRecord(
        load_g=set_row.load_g,
        reps=set_row.reps,
        is_warmup=set_row.is_warmup,
        performed_on=performed_on,
        workout_id=workout_id,
    )


def _set_out(set_row: Set, unit: Unit) -> SetOut:
    return SetOut(
        id=set_row.id,
        set_number=set_row.set_number,
        load=_load_value(set_row.load_g, unit),
        reps=set_row.reps,
        is_warmup=set_row.is_warmup,
        rpe=float(set_row.rpe) if set_row.rpe is not None else None,
        notes=set_row.notes,
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
