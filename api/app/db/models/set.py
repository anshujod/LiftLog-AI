import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.workout_exercise import WorkoutExercise


class Set(Base):
    __tablename__ = "sets"
    __table_args__ = (
        UniqueConstraint("workout_exercise_id", "set_number"),
        CheckConstraint("reps > 0", name="sets_reps_check"),
        CheckConstraint("rpe BETWEEN 1 AND 10", name="sets_rpe_check"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    workout_exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workout_exercises.id", ondelete="CASCADE"), nullable=False
    )
    set_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    load_g: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    is_warmup: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    rpe: Mapped[float | None] = mapped_column(Numeric(3, 1))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    workout_exercise: Mapped["WorkoutExercise"] = relationship(back_populates="sets")
