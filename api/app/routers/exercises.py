from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_visible_exercise
from app.db.models import Exercise, MuscleGroup, User
from app.db.session import get_db
from app.schemas.analytics import ProgressionOut
from app.schemas.exercise import ExerciseCreate, ExerciseOut, ExerciseUpdate, MuscleGroupOut
from app.schemas.pr import ExercisePRsOut
from app.schemas.session import HistoryPageOut, LastSessionOut
from app.services import analytics_service, exercise_service
from app.services.analytics_service import Period

router = APIRouter(tags=["exercises"])


@router.get("/muscle-groups", response_model=list[MuscleGroupOut])
def list_muscle_groups(db: Session = Depends(get_db)) -> list[MuscleGroup]:
    return exercise_service.list_muscle_groups(db)


@router.get("/exercises", response_model=list[ExerciseOut])
def list_exercises(
    q: str | None = None,
    muscle_group: str | None = None,
    include_custom: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ExerciseOut]:
    exercises = exercise_service.list_exercises(db, current_user, q, muscle_group, include_custom)
    return [ExerciseOut.from_model(exercise) for exercise in exercises]


@router.post("/exercises", response_model=ExerciseOut)
def create_exercise(
    payload: ExerciseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExerciseOut:
    exercise = exercise_service.create_exercise(db, current_user, payload)
    return ExerciseOut.from_model(exercise)


@router.get("/exercises/{exercise_id}", response_model=ExerciseOut)
def get_exercise(exercise: Exercise = Depends(get_visible_exercise)) -> ExerciseOut:
    return ExerciseOut.from_model(exercise)


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    payload: ExerciseUpdate,
    exercise: Exercise = Depends(get_visible_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExerciseOut:
    updated = exercise_service.update_exercise(db, current_user, exercise, payload)
    return ExerciseOut.from_model(updated)


@router.get("/exercises/{exercise_id}/last-session", response_model=LastSessionOut)
def get_last_session(
    exercise: Exercise = Depends(get_visible_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LastSessionOut:
    return exercise_service.get_last_session(db, current_user, exercise)


@router.get("/exercises/{exercise_id}/history", response_model=HistoryPageOut)
def get_history(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    exercise: Exercise = Depends(get_visible_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HistoryPageOut:
    return exercise_service.get_history(db, current_user, exercise, limit, cursor)


@router.get("/exercises/{exercise_id}/prs", response_model=ExercisePRsOut)
def get_prs(
    exercise: Exercise = Depends(get_visible_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExercisePRsOut:
    return exercise_service.get_prs(db, current_user, exercise)


@router.get("/exercises/{exercise_id}/progress", response_model=ProgressionOut)
def get_exercise_progress(
    period: Period = "90d",
    exercise: Exercise = Depends(get_visible_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProgressionOut:
    return analytics_service.get_exercise_progress(db, current_user, exercise, period)
