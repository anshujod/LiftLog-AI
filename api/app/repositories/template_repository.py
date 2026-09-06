import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import Exercise
from app.db.models.workout_template import TemplateExercise, WorkoutTemplate
from app.schemas.template import TemplateExerciseIn


def list_for_user(db: Session, user_id: uuid.UUID) -> list[WorkoutTemplate]:
    return list(
        db.scalars(
            select(WorkoutTemplate)
            .where(WorkoutTemplate.user_id == user_id)
            .options(
                selectinload(WorkoutTemplate.template_exercises).selectinload(
                    TemplateExercise.exercise
                )
            )
            .order_by(WorkoutTemplate.created_at.desc())
        )
    )


def get_with_exercises(db: Session, template_id: uuid.UUID) -> WorkoutTemplate | None:
    return db.scalar(
        select(WorkoutTemplate)
        .where(WorkoutTemplate.id == template_id)
        .options(
            selectinload(WorkoutTemplate.template_exercises).selectinload(TemplateExercise.exercise)
        )
    )


def get_by_name_for_user(db: Session, user_id: uuid.UUID, name: str) -> WorkoutTemplate | None:
    return db.scalar(
        select(WorkoutTemplate).where(
            WorkoutTemplate.user_id == user_id,
            func.lower(WorkoutTemplate.name) == name.lower(),
        )
    )


def create_template(
    db: Session, user_id: uuid.UUID, name: str, notes: str | None
) -> WorkoutTemplate:
    template = WorkoutTemplate(user_id=user_id, name=name, notes=notes)
    db.add(template)
    db.flush()
    return template


def add_exercise(
    db: Session,
    template_id: uuid.UUID,
    exercise_id: uuid.UUID,
    position: int,
    target_sets: int | None,
    notes: str | None,
) -> TemplateExercise:
    row = TemplateExercise(
        template_id=template_id,
        exercise_id=exercise_id,
        position=position,
        target_sets=target_sets,
        notes=notes,
    )
    db.add(row)
    db.flush()
    return row


def set_exercises(db: Session, template_id: uuid.UUID, exercises: list[TemplateExerciseIn]) -> None:
    existing = list(
        db.scalars(
            select(TemplateExercise)
            .where(TemplateExercise.template_id == template_id)
            .order_by(TemplateExercise.position)
        )
    )
    for row in existing:
        db.delete(row)
    db.flush()
    for position, item in enumerate(exercises, start=1):
        add_exercise(db, template_id, item.exercise_id, position, item.target_sets, item.notes)


def delete_template(db: Session, template: WorkoutTemplate) -> None:
    db.delete(template)


def exercise_is_visible_to_user(db: Session, exercise_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        return False
    return exercise.user_id in (None, user_id)
