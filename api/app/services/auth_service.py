import uuid

from sqlalchemy.orm import Session

from app.core.errors import AuthError, ConflictError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.repositories import user_repository
from app.schemas.auth import TokenResponse

_GENERIC_REGISTER_ERROR = "Unable to register with the given details"
_GENERIC_LOGIN_ERROR = "Incorrect email or password"
_TIMING_SAFE_DUMMY_HASH = hash_password("liftlog-timing-safety-dummy-password")


def register(db: Session, email: str, password: str) -> TokenResponse:
    if user_repository.get_by_email(db, email) is not None:
        raise ConflictError(_GENERIC_REGISTER_ERROR)

    user = user_repository.create(db, email=email, password_hash=hash_password(password))
    db.commit()
    return _issue_tokens(user.id)


def login(db: Session, email: str, password: str) -> TokenResponse:
    user = user_repository.get_by_email(db, email)
    if user is None:
        verify_password(password, _TIMING_SAFE_DUMMY_HASH)
        raise AuthError(_GENERIC_LOGIN_ERROR)

    if not verify_password(password, user.password_hash):
        raise AuthError(_GENERIC_LOGIN_ERROR)

    return _issue_tokens(user.id)


def refresh(db: Session, refresh_token: str) -> TokenResponse:
    user_id = decode_token(refresh_token, expected_type="refresh")
    user = user_repository.get_by_id(db, user_id)
    if user is None:
        raise AuthError("Invalid or expired token")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
        token_type="bearer",
    )


def _issue_tokens(user_id: uuid.UUID) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
        token_type="bearer",
    )
