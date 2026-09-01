from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Exercise, MuscleGroup


def test_muscle_groups_seeded(db_session: Session) -> None:
    count = db_session.scalar(select(func.count()).select_from(MuscleGroup))
    assert count == 7


def test_exercises_seeded(db_session: Session) -> None:
    count = db_session.scalar(
        select(func.count()).select_from(Exercise).where(Exercise.user_id.is_(None))
    )
    assert count == 63


def test_global_exercises_have_no_owner(db_session: Session) -> None:
    bench = db_session.scalar(select(Exercise).where(Exercise.name == "Bench Press"))
    assert bench is not None
    assert bench.user_id is None
    assert bench.load_type.value == "barbell_total"
