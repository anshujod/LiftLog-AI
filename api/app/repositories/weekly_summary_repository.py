import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.weekly_summary import WeeklySummary


def get_cached(
    db: Session, user_id: uuid.UUID, iso_year: int, iso_week: int
) -> dict[str, Any] | None:
    row = db.scalar(
        select(WeeklySummary).where(
            WeeklySummary.user_id == user_id,
            WeeklySummary.iso_year == iso_year,
            WeeklySummary.iso_week == iso_week,
        )
    )
    return dict(row.summary_json) if row is not None else None


def save(
    db: Session, user_id: uuid.UUID, iso_year: int, iso_week: int, summary: dict[str, Any]
) -> None:
    existing = db.scalar(
        select(WeeklySummary).where(
            WeeklySummary.user_id == user_id,
            WeeklySummary.iso_year == iso_year,
            WeeklySummary.iso_week == iso_week,
        )
    )
    if existing is not None:
        existing.summary_json = summary
    else:
        db.add(
            WeeklySummary(
                user_id=user_id, iso_year=iso_year, iso_week=iso_week, summary_json=summary
            )
        )
    db.commit()
