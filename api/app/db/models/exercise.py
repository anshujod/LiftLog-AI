import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.models.enums import (
    LoadType,
    ProgressionMetric,
    load_type_enum,
    progression_metric_enum,
)

if TYPE_CHECKING:
    from app.db.models.muscle_group import MuscleGroup
    from app.db.models.user import User
    from app.db.models.workout_exercise import WorkoutExercise


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    muscle_group_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("muscle_groups.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    load_type: Mapped[LoadType] = mapped_column(load_type_enum, nullable=False)
    progression_metric: Mapped[ProgressionMetric] = mapped_column(
        progression_metric_enum, nullable=False, server_default=ProgressionMetric.E1RM.value
    )
    default_increment_g: Mapped[int] = mapped_column(Integer, nullable=False, server_default="2500")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped["User | None"] = relationship(back_populates="exercises")
    muscle_group: Mapped["MuscleGroup"] = relationship(back_populates="exercises")
    workout_exercises: Mapped[list["WorkoutExercise"]] = relationship(back_populates="exercise")
