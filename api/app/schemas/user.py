import uuid

from pydantic import BaseModel, ConfigDict

from app.db.models.enums import UnitPref


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    unit_preference: UnitPref
    bodyweight_g: int | None


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unit_preference: UnitPref | None = None
    bodyweight_g: int | None = None
