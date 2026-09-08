import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("liftlog.errors")


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class AuthError(AppError):
    status_code = 401
    code = "auth_error"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class AIUnavailableError(AppError):
    status_code = 503
    code = "ai_unavailable"


def request_id_of(request: Request | None) -> str:
    if request is not None:
        request_id = getattr(request.state, "request_id", None)
        if isinstance(request_id, str) and request_id:
            return request_id
    return uuid.uuid4().hex


def error_response(code: str, message: str, status_code: int, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "request_id": request_id}},
    )


def _validation_message(exc: RequestValidationError) -> str:
    try:
        parts: list[str] = []
        for error in exc.errors()[:3]:
            loc = ".".join(str(item) for item in error.get("loc", ())[1:])
            parts.append(f"{loc or 'body'}: {error.get('msg', 'invalid')}")
        return "; ".join(parts) if parts else "Invalid request"
    except Exception:
        return "Invalid request"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.code, exc.message, exc.status_code, request_id_of(request))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            "validation_error", _validation_message(exc), 422, request_id_of(request)
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return error_response("not_found", "Not found", 404, request_id_of(request))
        return error_response(
            "http_error", "Request failed", exc.status_code, request_id_of(request)
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        request_id = request_id_of(request)
        # Stack traces and raw messages (which may contain SQL) are logged
        # server-side only. The client gets a generic message plus the
        # correlation id to quote back.
        logger.exception(
            "unhandled error",
            extra={"request_id": request_id, "path": request.url.path},
        )
        return error_response("internal_error", "Something went wrong", 500, request_id)
