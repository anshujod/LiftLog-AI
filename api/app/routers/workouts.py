from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import (
    get_current_user,
    get_owned_set,
    get_owned_workout,
    get_owned_workout_exercise,
)
from app.db.models import Set, User, Workout, WorkoutExercise
from app.db.session import get_db
from app.schemas.workout import (
    FinishSummaryOut,
    SetIn,
    SetOut,
    SetUpdate,
    WorkoutCreate,
    WorkoutExerciseCreate,
    WorkoutExerciseOut,
    WorkoutExerciseUpdate,
    WorkoutOut,
    WorkoutsPageOut,
    WorkoutUpdate,
)
from app.services import workout_service

router = APIRouter(tags=["workouts"])


@router.post("/workouts", response_model=WorkoutOut)
def create_workout(
    payload: WorkoutCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutOut:
    return workout_service.create_workout(db, current_user, payload)


@router.get("/workouts", response_model=WorkoutsPageOut)
def list_workouts(
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutsPageOut:
    return workout_service.list_workouts(db, current_user, limit, cursor)


@router.get("/workouts/{workout_id}", response_model=WorkoutOut)
def get_workout(
    workout: Workout = Depends(get_owned_workout),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutOut:
    return workout_service.get_workout(db, current_user, workout.id)


@router.patch("/workouts/{workout_id}", response_model=WorkoutOut)
def update_workout(
    payload: WorkoutUpdate,
    workout: Workout = Depends(get_owned_workout),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutOut:
    return workout_service.update_workout(db, current_user, workout, payload)


@router.delete("/workouts/{workout_id}", status_code=204)
def delete_workout(
    workout: Workout = Depends(get_owned_workout),
    db: Session = Depends(get_db),
) -> None:
    workout_service.delete_workout(db, workout)


@router.post("/workouts/{workout_id}/finish", response_model=FinishSummaryOut)
def finish_workout(
    workout: Workout = Depends(get_owned_workout),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FinishSummaryOut:
    return workout_service.finish_workout(db, current_user, workout)


@router.post("/workouts/{workout_id}/exercises", response_model=WorkoutExerciseOut)
def add_workout_exercise(
    payload: WorkoutExerciseCreate,
    workout: Workout = Depends(get_owned_workout),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutExerciseOut:
    return workout_service.add_workout_exercise(db, current_user, workout, payload)


@router.delete("/workout-exercises/{workout_exercise_id}", status_code=204)
def delete_workout_exercise(
    workout_exercise: WorkoutExercise = Depends(get_owned_workout_exercise),
    db: Session = Depends(get_db),
) -> None:
    workout_service.delete_workout_exercise(db, workout_exercise)


@router.patch("/workout-exercises/{workout_exercise_id}", response_model=WorkoutExerciseOut)
def update_workout_exercise(
    payload: WorkoutExerciseUpdate,
    workout_exercise: WorkoutExercise = Depends(get_owned_workout_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutExerciseOut:
    return workout_service.update_workout_exercise(db, current_user, workout_exercise, payload)


@router.post("/workout-exercises/{workout_exercise_id}/sets", response_model=SetOut)
def add_set(
    payload: SetIn,
    workout_exercise: WorkoutExercise = Depends(get_owned_workout_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SetOut:
    return workout_service.add_set(db, current_user, workout_exercise, payload)


@router.post("/workout-exercises/{workout_exercise_id}/sets/bulk", response_model=list[SetOut])
def bulk_replace_sets(
    payload: list[SetIn],
    workout_exercise: WorkoutExercise = Depends(get_owned_workout_exercise),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SetOut]:
    return workout_service.bulk_replace_sets(db, current_user, workout_exercise, payload)


@router.patch("/sets/{set_id}", response_model=SetOut)
def update_set(
    payload: SetUpdate,
    workout_set: Set = Depends(get_owned_set),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SetOut:
    return workout_service.update_set(db, current_user, workout_set, payload)


@router.delete("/sets/{set_id}", status_code=204)
def delete_set(
    workout_set: Set = Depends(get_owned_set),
    db: Session = Depends(get_db),
) -> None:
    workout_service.delete_set(db, workout_set)
