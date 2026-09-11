import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AuthError, ConflictError
from app.core.google import verify_google_id_token
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
_GENERIC_GOOGLE_ERROR = "Unable to sign in with Google"
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

    # Google-only accounts have no password; keep the failure message identical
    # so password login never reveals whether an email exists or how it signs in.
    if user.password_hash is None:
        verify_password(password, _TIMING_SAFE_DUMMY_HASH)
        raise AuthError(_GENERIC_LOGIN_ERROR)

    if not verify_password(password, user.password_hash):
        raise AuthError(_GENERIC_LOGIN_ERROR)

    return _issue_tokens(user.id)


def login_with_google(db: Session, id_token: str) -> TokenResponse:
    """Verify a Google ID token, then find / auto-link / create the user.

    Linking rule: a verified Google email auto-links to an existing account
    with the same email (case-insensitive via citext). A conflicting
    `google_sub` on that account is treated as a generic failure to avoid
    account-enumeration or takeover probing.
    """
    try:
        identity = verify_google_id_token(id_token)
    except AuthError as exc:
        # Never leak verification internals (aud mismatch, expiry, config).
        raise AuthError(_GENERIC_GOOGLE_ERROR) from exc

    user = user_repository.get_by_google_sub(db, identity.sub)
    if user is not None:
        return _issue_tokens(user.id)

    existing = user_repository.get_by_email(db, identity.email)
    if existing is not None:
        if existing.google_sub is not None and existing.google_sub != identity.sub:
            raise AuthError(_GENERIC_GOOGLE_ERROR)
        try:
            user_repository.set_google_sub(db, existing, identity.sub)
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            linked = user_repository.get_by_google_sub(db, identity.sub)
            if linked is None:
                raise AuthError(_GENERIC_GOOGLE_ERROR) from exc
            return _issue_tokens(linked.id)
        return _issue_tokens(existing.id)

    try:
        user = user_repository.create_google_user(db, email=identity.email, google_sub=identity.sub)
        db.commit()
    except IntegrityError as exc:
        # Lost a race with a concurrent register/link: re-read and proceed.
        db.rollback()
        user = user_repository.get_by_google_sub(db, identity.sub)
        if user is None:
            user = user_repository.get_by_email(db, identity.email)
        if user is None:
            raise AuthError(_GENERIC_GOOGLE_ERROR) from exc
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
