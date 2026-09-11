"""Google ID-token verification for Sign in with Google.

The frontend uses Google Identity Services to obtain an ID token (JWT signed by
Google). The backend verifies it here and only trusts the `sub` + verified
`email` it contains — never any client-supplied email. See
`app/services/auth_service.py::login_with_google`.
"""

import logging
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.errors import AuthError

# Failure reasons are logged server-side only (never the token, never
# secrets) so a production 401 can actually be diagnosed from the logs.
# The client always gets the same generic message.
logger = logging.getLogger("liftlog.auth")


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str


def verify_google_id_token(id_token: str) -> GoogleIdentity:
    settings = get_settings()
    if not settings.google_client_id:
        logger.warning("google sign-in rejected: GOOGLE_CLIENT_ID is not configured")
        raise AuthError("Google sign-in is not configured")

    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError as exc:
        logger.warning("google sign-in rejected: google-auth package is not installed")
        raise AuthError("Google sign-in is not configured") from exc

    try:
        payload = google_id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
            id_token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError as exc:
        # google-auth failure text names the cause (wrong audience, expired,
        # bad signature...) without echoing the token.
        logger.warning("google id-token verification failed: %s", exc)
        raise AuthError("Invalid Google credential") from exc
    except Exception as exc:  # network / cert fetch failures, malformed token
        logger.warning("google id-token verification errored: %s", type(exc).__name__)
        raise AuthError("Invalid Google credential") from exc

    sub = payload.get("sub")
    email = payload.get("email")
    email_verified = payload.get("email_verified", False)
    if not isinstance(sub, str) or not sub:
        logger.warning("google id-token rejected: missing sub claim")
        raise AuthError("Invalid Google credential")
    if not isinstance(email, str) or not email or email_verified is not True:
        logger.warning("google id-token rejected: email missing or unverified")
        raise AuthError("Invalid Google credential")
    return GoogleIdentity(sub=sub, email=email)
