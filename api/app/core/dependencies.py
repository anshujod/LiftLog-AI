import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AuthError, NotFoundError
from app.core.security import decode_token
from app.db.models import Exercise, Set, User, Workout, WorkoutExercise
from app.db.session import get_db

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AuthError("Not authenticated")

    user_id = decode_token(credentials.credentials, expected_type="access")
    user = db.get(User, user_id)
    if user is None:
        raise AuthError("Not authenticated")
    return user


def get_owned_workout(
    workout_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Workout:
    workout = db.get(Workout, workout_id)
    if workout is None or workout.user_id != current_user.id:
        raise NotFoundError("Workout not found")
    return workout


def get_owned_workout_exercise(
    workout_exercise_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkoutExercise:
    workout_exercise = db.get(WorkoutExercise, workout_exercise_id)
    if workout_exercise is None or workout_exercise.workout.user_id != current_user.id:
        raise NotFoundError("Workout exercise not found")
    return workout_exercise


def get_owned_set(
    set_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Set:
    workout_set = db.get(Set, set_id)
    if workout_set is None or workout_set.workout_exercise.workout.user_id != current_user.id:
        raise NotFoundError("Set not found")
    return workout_set


def get_visible_exercise(
    exercise_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    is_foreign_custom = exercise is not None and exercise.user_id not in (None, current_user.id)
    if exercise is None or is_foreign_custom:
        raise NotFoundError("Exercise not found")
    return exercise
