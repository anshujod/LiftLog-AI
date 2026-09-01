from sqlalchemy.orm import Session

from app.db.models import User
from app.schemas.user import UserUpdate


def update_me(db: Session, user: User, data: UserUpdate) -> User:
    if data.unit_preference is not None:
        user.unit_preference = data.unit_preference
    if data.bodyweight_g is not None:
        user.bodyweight_g = data.bodyweight_g

    db.commit()
    db.refresh(user)
    return user
