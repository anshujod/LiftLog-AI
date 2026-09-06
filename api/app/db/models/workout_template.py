import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.db.models.exercise import Exercise
    from app.db.models.user import User


class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"
    __table_args__ = (Index("workout_templates_user_idx", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    user: Mapped["User"] = relationship(back_populates="workout_templates")
    template_exercises: Mapped[list["TemplateExercise"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class TemplateExercise(Base):
    __tablename__ = "template_exercises"
    __table_args__ = (
        UniqueConstraint("template_id", "position"),
        Index("template_exercises_template_idx", "template_id"),
        Index("template_exercises_exercise_idx", "exercise_id"),
        CheckConstraint(
            "target_sets IS NULL OR target_sets > 0",
            name="template_exercises_target_sets_check",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    target_sets: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None] = mapped_column(Text)

    template: Mapped["WorkoutTemplate"] = relationship(back_populates="template_exercises")
    exercise: Mapped["Exercise"] = relationship(back_populates="template_exercises")
