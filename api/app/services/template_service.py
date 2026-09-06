import uuid
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.db.models import User
from app.db.models.workout_template import TemplateExercise, WorkoutTemplate
from app.repositories import exercise_repository, template_repository, workout_repository
from app.schemas.exercise import ExerciseOut
from app.schemas.template import (
    TemplateCreate,
    TemplateExerciseIn,
    TemplateExerciseOut,
    TemplateOut,
    TemplateSummaryOut,
    TemplateUpdate,
)
from app.schemas.workout import WorkoutOut


def list_templates(db: Session, user: User) -> list[TemplateSummaryOut]:
    templates = template_repository.list_for_user(db, user.id)
    return [
        TemplateSummaryOut(
            id=t.id,
            name=t.name,
            notes=t.notes,
            created_at=t.created_at,
            exercise_count=len(t.template_exercises),
        )
        for t in templates
    ]


def create_template(db: Session, user: User, data: TemplateCreate) -> TemplateOut:
    _ensure_name_available(db, user.id, data.name, ignore_id=None)
    _ensure_exercises_visible(db, user.id, data.exercises)

    template = template_repository.create_template(db, user.id, data.name.strip(), data.notes)
    template_repository.set_exercises(db, template.id, data.exercises)
    db.commit()
    return _template_out(db, user, template.id)


def get_template(db: Session, user: User, template_id: uuid.UUID) -> TemplateOut:
    return _template_out(db, user, template_id)


def update_template(
    db: Session, user: User, template: WorkoutTemplate, data: TemplateUpdate
) -> TemplateOut:
    updates = data.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is not None:
        new_name = updates["name"].strip()
        if new_name.lower() != template.name.lower():
            _ensure_name_available(db, user.id, new_name, ignore_id=template.id)
        template.name = new_name
    if "notes" in updates:
        template.notes = updates["notes"]
    if data.exercises is not None:
        _ensure_exercises_visible(db, user.id, data.exercises)
        template_repository.set_exercises(db, template.id, data.exercises)

    db.commit()
    return _template_out(db, user, template.id)


def delete_template(db: Session, template: WorkoutTemplate) -> None:
    template_repository.delete_template(db, template)
    db.commit()


def create_template_from_workout(
    db: Session, user: User, workout_id: uuid.UUID, name: str, notes: str | None
) -> TemplateOut:
    detail = workout_repository.get_with_details(db, workout_id)
    if detail is None or detail.user_id != user.id:
        raise NotFoundError("Workout not found")

    clean_name = name.strip()
    if not clean_name:
        raise ValidationError("name must not be blank")
    _ensure_name_available(db, user.id, clean_name, ignore_id=None)

    ordered = sorted(detail.workout_exercises, key=lambda we: we.position)
    items = [
        TemplateExerciseIn(
            exercise_id=we.exercise_id,
            target_sets=len([s for s in we.sets if not s.is_warmup]) or None,
            notes=None,
        )
        for we in ordered
    ]

    template = template_repository.create_template(db, user.id, clean_name, notes)
    template_repository.set_exercises(db, template.id, items)
    db.commit()
    return _template_out(db, user, template.id)


def create_workout_from_template(db: Session, user: User, template: WorkoutTemplate) -> WorkoutOut:
    from app.services import workout_service as workout_service_mod

    # Refresh with exercises + nested exercise rows in a single query.
    full = template_repository.get_with_exercises(db, template.id)
    assert full is not None
    ordered = sorted(full.template_exercises, key=lambda te: te.position)

    for te in ordered:
        if not template_repository.exercise_is_visible_to_user(db, te.exercise_id, user.id):
            raise NotFoundError("Exercise not found")

    workout = workout_repository.create(
        db,
        user.id,
        date.today(),
        datetime.now(UTC),
        full.name,
        None,
    )
    db.flush()

    for te in ordered:
        workout_exercise = workout_repository.add_exercise(db, workout.id, te.exercise_id, None)
        db.flush()
        _prefill_from_last_session(db, user, te.exercise_id, workout_exercise.id)

    db.commit()
    return workout_service_mod.get_workout(db, user, workout.id)


def _prefill_from_last_session(
    db: Session, user: User, exercise_id: uuid.UUID, workout_exercise_id: uuid.UUID
) -> None:
    from app.schemas.workout import SetIn

    rows = exercise_repository.get_last_completed_session_sets(db, exercise_id, user.id)
    working = sorted(
        (row for row in rows if not row[0].is_warmup),
        key=lambda row: row[0].set_number,
    )
    if not working:
        return
    sets_in = [
        SetIn(
            load_g=row[0].load_g,
            reps=row[0].reps,
            is_warmup=False,
            rpe=float(row[0].rpe) if row[0].rpe is not None else None,
            notes=row[0].notes,
        )
        for row in working
    ]
    workout_repository.replace_sets(db, workout_exercise_id, sets_in)
    db.flush()


def _template_out(db: Session, user: User, template_id: uuid.UUID) -> TemplateOut:
    template = template_repository.get_with_exercises(db, template_id)
    if template is None or template.user_id != user.id:
        raise NotFoundError("Template not found")
    ordered = sorted(template.template_exercises, key=lambda te: te.position)
    return TemplateOut(
        id=template.id,
        name=template.name,
        notes=template.notes,
        created_at=template.created_at,
        exercises=[_template_exercise_out(te) for te in ordered],
    )


def _template_exercise_out(te: TemplateExercise) -> TemplateExerciseOut:
    return TemplateExerciseOut(
        id=te.id,
        exercise=ExerciseOut.from_model(te.exercise),
        position=te.position,
        target_sets=te.target_sets,
        notes=te.notes,
    )


def _ensure_name_available(
    db: Session, user_id: uuid.UUID, name: str, ignore_id: uuid.UUID | None
) -> None:
    existing = template_repository.get_by_name_for_user(db, user_id, name.strip())
    if existing is not None and existing.id != ignore_id:
        raise ConflictError("A template with this name already exists")


def _ensure_exercises_visible(
    db: Session, user_id: uuid.UUID, exercises: list[TemplateExerciseIn]
) -> None:
    seen: set[uuid.UUID] = set()
    for item in exercises:
        if item.exercise_id in seen:
            raise ConflictError("Duplicate exercise in template")
        seen.add(item.exercise_id)
        if not template_repository.exercise_is_visible_to_user(db, item.exercise_id, user_id):
            raise NotFoundError("Exercise not found")
