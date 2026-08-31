from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Exercise, LoadType, MuscleGroup, ProgressionMetric

DATA_PATH = Path(__file__).parent / "exercises.json"


def run_seed(session: Session) -> None:
    data = json.loads(DATA_PATH.read_text())

    slug_to_id: dict[str, int] = {}
    for group in data["muscle_groups"]:
        existing = session.scalar(select(MuscleGroup).where(MuscleGroup.slug == group["slug"]))
        if existing is None:
            existing = MuscleGroup(
                slug=group["slug"], name=group["name"], display_order=group["display_order"]
            )
            session.add(existing)
            session.flush()
        slug_to_id[group["slug"]] = existing.id

    for exercise in data["exercises"]:
        existing_exercise = session.scalar(
            select(Exercise).where(
                Exercise.user_id.is_(None),
                func.lower(Exercise.name) == exercise["name"].lower(),
            )
        )
        if existing_exercise is not None:
            continue
        session.add(
            Exercise(
                user_id=None,
                muscle_group_id=slug_to_id[exercise["muscle_group"]],
                name=exercise["name"],
                load_type=LoadType(exercise["load_type"]),
                progression_metric=ProgressionMetric(exercise["progression_metric"]),
            )
        )


def main() -> None:
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        run_seed(session)
        session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    main()
