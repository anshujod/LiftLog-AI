import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_by_google_sub(db: Session, google_sub: str) -> User | None:
    return db.scalar(select(User).where(User.google_sub == google_sub))


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def create(db: Session, *, email: str, password_hash: str | None) -> User:
    user = User(email=email, password_hash=password_hash)
    db.add(user)
    db.flush()
    return user


def create_google_user(db: Session, *, email: str, google_sub: str) -> User:
    user = User(email=email, password_hash=None, google_sub=google_sub)
    db.add(user)
    db.flush()
    return user


def set_google_sub(db: Session, user: User, google_sub: str) -> User:
    user.google_sub = google_sub
    db.add(user)
    db.flush()
    return user
