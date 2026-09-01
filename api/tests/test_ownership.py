from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_owned_workout, get_visible_exercise
from app.core.errors import NotFoundError
from app.core.security import hash_password
from app.db.models import Exercise, LoadType, MuscleGroup, User, Workout
from app.repositories import user_repository


def _create_user(db_session: Session, email: str) -> User:
    password_hash = hash_password("password123")
    user = user_repository.create(db_session, email=email, password_hash=password_hash)
    db_session.commit()
    return user


def test_user_cannot_access_another_users_workout(db_session: Session) -> None:
    owner = _create_user(db_session, "owner-a@example.com")
    other = _create_user(db_session, "owner-b@example.com")

    workout = Workout(user_id=owner.id, performed_on=date.today())
    db_session.add(workout)
    db_session.commit()

    with pytest.raises(NotFoundError):
        get_owned_workout(workout.id, current_user=other, db=db_session)

    result = get_owned_workout(workout.id, current_user=owner, db=db_session)
    assert result.id == workout.id


def test_visible_exercise_hides_other_users_custom_exercise(db_session: Session) -> None:
    owner = _create_user(db_session, "custom-a@example.com")
    other = _create_user(db_session, "custom-b@example.com")
    muscle_group = db_session.scalar(select(MuscleGroup).limit(1))
    assert muscle_group is not None

    custom = Exercise(
        user_id=owner.id,
        muscle_group_id=muscle_group.id,
        name="Owner A Secret Lift",
        load_type=LoadType.BARBELL_TOTAL,
    )
    db_session.add(custom)
    db_session.commit()

    with pytest.raises(NotFoundError):
        get_visible_exercise(custom.id, current_user=other, db=db_session)

    result = get_visible_exercise(custom.id, current_user=owner, db=db_session)
    assert result.id == custom.id


def test_visible_exercise_allows_global_exercise_for_any_user(db_session: Session) -> None:
    user = _create_user(db_session, "any-user@example.com")
    global_exercise = db_session.scalar(select(Exercise).where(Exercise.user_id.is_(None)).limit(1))
    assert global_exercise is not None

    result = get_visible_exercise(global_exercise.id, current_user=user, db=db_session)
    assert result.id == global_exercise.id
