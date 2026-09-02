import uuid
from typing import Self

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import Exercise
from app.db.models.enums import LoadType, ProgressionMetric


class MuscleGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    display_order: int


class ExerciseOut(BaseModel):
    id: uuid.UUID
    muscle_group_id: int
    name: str
    load_type: LoadType
    progression_metric: ProgressionMetric
    default_increment_g: int
    is_active: bool
    is_custom: bool

    @classmethod
    def from_model(cls, exercise: Exercise) -> Self:
        return cls(
            id=exercise.id,
            muscle_group_id=exercise.muscle_group_id,
            name=exercise.name,
            load_type=exercise.load_type,
            progression_metric=exercise.progression_metric,
            default_increment_g=exercise.default_increment_g,
            is_active=exercise.is_active,
            is_custom=exercise.user_id is not None,
        )


class ExerciseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    muscle_group_id: int
    name: str = Field(min_length=1, max_length=200)
    load_type: LoadType
    progression_metric: ProgressionMetric = ProgressionMetric.E1RM
    default_increment_g: int = Field(default=2500, gt=0)


class ExerciseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    muscle_group_id: int | None = None
    load_type: LoadType | None = None
    progression_metric: ProgressionMetric | None = None
    default_increment_g: int | None = Field(default=None, gt=0)
    is_active: bool | None = None
