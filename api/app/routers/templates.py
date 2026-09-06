from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_owned_template, get_owned_workout
from app.db.models import User, Workout
from app.db.models.workout_template import WorkoutTemplate
from app.db.session import get_db
from app.schemas.template import (
    TemplateCreate,
    TemplateFromWorkoutIn,
    TemplateOut,
    TemplateSummaryOut,
    TemplateUpdate,
)
from app.schemas.workout import WorkoutOut
from app.services import template_service

router = APIRouter(tags=["templates"])


@router.get("/templates", response_model=list[TemplateSummaryOut])
def list_templates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TemplateSummaryOut]:
    return template_service.list_templates(db, current_user)


@router.post("/templates", response_model=TemplateOut)
def create_template(
    payload: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TemplateOut:
    return template_service.create_template(db, current_user, payload)


@router.get("/templates/{template_id}", response_model=TemplateOut)
def get_template(
    template: WorkoutTemplate = Depends(get_owned_template),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TemplateOut:
    return template_service.get_template(db, current_user, template.id)


@router.patch("/templates/{template_id}", response_model=TemplateOut)
def update_template(
    payload: TemplateUpdate,
    template: WorkoutTemplate = Depends(get_owned_template),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TemplateOut:
    return template_service.update_template(db, current_user, template, payload)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(
    template: WorkoutTemplate = Depends(get_owned_template),
    db: Session = Depends(get_db),
) -> None:
    template_service.delete_template(db, template)


@router.post("/templates/from-workout/{workout_id}", response_model=TemplateOut)
def create_template_from_workout(
    payload: TemplateFromWorkoutIn,
    workout: Workout = Depends(get_owned_workout),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TemplateOut:
    return template_service.create_template_from_workout(
        db, current_user, workout.id, payload.name, payload.notes
    )


@router.post("/workouts/from-template/{template_id}", response_model=WorkoutOut)
def create_workout_from_template(
    template: WorkoutTemplate = Depends(get_owned_template),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutOut:
    return template_service.create_workout_from_template(db, current_user, template)
