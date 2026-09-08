"""HTTP middleware: request ids, access logging, security headers, rate limits.

Order of execution is outer → inner: RequestIDMiddleware (also writes the
JSON access log), SecurityHeadersMiddleware, RateLimitMiddleware. Registered
in reverse in `main.py` because Starlette runs the last-added middleware
first.
"""

import contextlib
import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core import rate_limit
from app.core.errors import error_response

access_logger = logging.getLogger("liftlog.access")
# The default root level is WARNING, which would silently drop these lines in
# production. Pin INFO here so deployment needs no logging config to get them.
access_logger.setLevel(logging.INFO)

_DOC_PATHS = ("/docs", "/redoc", "/openapi.json")


def new_request_id() -> str:
    return uuid.uuid4().hex


def request_id_of(request: Request) -> str:
    return getattr(request.state, "request_id", None) or new_request_id()


def client_ip_of(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def request_user_id(request: Request) -> str | None:
    """Best-effort user id for logs only: decodes the bearer token without
    touching the database. Never raises, never logs the token itself."""
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        from app.core.security import decode_token

        return str(decode_token(token.strip(), expected_type="access"))
    except Exception:
        return None


def route_of(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    return path if isinstance(path, str) else request.url.path


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Assigns every request an id, returns it on the response, and writes
    one JSON access-log line. The log carries ids, route, status, and
    duration only — never headers, bodies, or secrets."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = new_request_id()
        request.state.request_id = request_id
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            response_status = status_code
            with contextlib.suppress(Exception):
                access_logger.info(
                    json.dumps(
                        {
                            "request_id": request_id,
                            "method": request.method,
                            "route": route_of(request),
                            "status": response_status,
                            "duration_ms": duration_ms,
                            "user_id": request_user_id(request),
                        }
                    )
                )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """HSTS, no-sniff, referrer, framing, and a restrictive CSP. The
    interactive docs paths are exempt from the CSP so Swagger UI keeps
    working; everything else serves JSON and needs no active content."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if not request.url.path.startswith(_DOC_PATHS):
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rejects over-limit clients per `rate_limit` scopes with a 429 in the
    standard envelope. Runs inside the request-id middleware so rejections
    carry the same correlation id."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        scope = rate_limit.scope_for_path(request.url.path)
        if scope is not None:
            allowed, retry_after = rate_limit.check(client_ip_of(request), scope)
            if not allowed:
                response = error_response(
                    "rate_limited",
                    "Too many requests, slow down",
                    429,
                    request_id_of(request),
                )
                response.headers["Retry-After"] = str(int(retry_after) + 1)
                return response
        return await call_next(request)
