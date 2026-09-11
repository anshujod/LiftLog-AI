import inspect
import json
import logging
import uuid

import pydantic
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core import config as config_module
from app.core import rate_limit
from app.main import app


def _register(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": "supersecurepw"})
    assert resp.status_code == 200
    return resp.json()


def _auth_headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


class TestAuthCoverage:
    """Every route except an explicit public list must require authentication."""

    PUBLIC_PATHS = {"/health", "/auth/register", "/auth/login", "/auth/refresh", "/auth/google"}

    def test_openapi_schema_has_no_unprotected_routes(self) -> None:
        spec = app.openapi()
        methods = ("get", "post", "put", "patch", "delete")
        for path, operations in spec["paths"].items():
            for method, operation in operations.items():
                if method not in methods:
                    continue
                if path in self.PUBLIC_PATHS:
                    continue
                assert operation.get("security"), (
                    f"{method.upper()} {path} is missing authentication"
                )


class TestRateLimits:
    def test_auth_endpoints_allow_five_then_reject(self, db_session: Session) -> None:
        with TestClient(app) as client:
            rate_limit.set_enabled(True)
            rate_limit.reset()
            try:
                statuses = [
                    client.post(
                        "/auth/register",
                        json={
                            "email": f"rl-{i}-{uuid.uuid4()}@example.com",
                            "password": "supersecurepw",
                        },
                    ).status_code
                    for i in range(6)
                ]
                assert statuses[:5] == [200] * 5
                assert statuses[5] == 429
            finally:
                rate_limit.set_enabled(False)
                rate_limit.reset()

    def test_rejection_uses_envelope_with_retry_after(self, db_session: Session) -> None:
        with TestClient(app) as client:
            rate_limit.set_enabled(True)
            rate_limit.reset()
            try:
                for i in range(5):
                    client.post(
                        "/auth/register",
                        json={
                            "email": f"rl2-{i}-{uuid.uuid4()}@example.com",
                            "password": "supersecurepw",
                        },
                    )
                resp = client.post(
                    "/auth/register",
                    json={
                        "email": f"rl2-x-{uuid.uuid4()}@example.com",
                        "password": "supersecurepw",
                    },
                )
                assert resp.status_code == 429
                body = resp.json()
                assert body["error"]["code"] == "rate_limited"
                assert body["error"]["request_id"]
                assert resp.headers["X-Request-ID"] == body["error"]["request_id"]
                assert "Retry-After" in resp.headers
            finally:
                rate_limit.set_enabled(False)
                rate_limit.reset()

    def test_ai_endpoints_are_limited(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService
        from app.ai.service import get_ai_service

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            rate_limit.set_enabled(True)
            rate_limit.reset()
            try:
                tokens = _register(client, f"rlai-{uuid.uuid4()}@example.com")
                headers = _auth_headers(tokens)
                statuses = [
                    client.post("/ai/chat", headers=headers, json={"message": "hi"}).status_code
                    for _ in range(31)
                ]
                assert statuses[:30] == [200] * 30
                assert statuses[30] == 429
            finally:
                rate_limit.set_enabled(False)
                rate_limit.reset()
                app.dependency_overrides.pop(get_ai_service, None)


class TestSecurityHeaders:
    def test_api_responses_carry_hardening_headers(self) -> None:
        with TestClient(app) as client:
            resp = client.get("/health")
            assert resp.headers["X-Content-Type-Options"] == "nosniff"
            assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
            assert resp.headers["X-Frame-Options"] == "DENY"
            assert "max-age=31536000" in resp.headers["Strict-Transport-Security"]
            assert "frame-ancestors 'none'" in resp.headers["Content-Security-Policy"]
            assert resp.headers["X-Request-ID"]

    def test_docs_are_exempt_from_csp_only(self) -> None:
        with TestClient(app) as client:
            resp = client.get("/docs")
            assert resp.status_code == 200
            assert "Content-Security-Policy" not in resp.headers
            assert resp.headers["X-Content-Type-Options"] == "nosniff"


class TestRequestIdAndErrors:
    def test_unknown_route_returns_envelope_with_request_id(self) -> None:
        with TestClient(app) as client:
            resp = client.get("/no-such-route")
            assert resp.status_code == 404
            body = resp.json()
            assert body["error"]["code"] == "not_found"
            assert body["error"]["request_id"]
            assert resp.headers["X-Request-ID"] == body["error"]["request_id"]

    def test_malformed_request_returns_clean_422(self) -> None:
        with TestClient(app) as client:
            resp = client.post("/auth/register", json={"email": "not-an-email"})
            assert resp.status_code == 422
            body = resp.json()
            assert body["error"]["code"] == "validation_error"
            assert body["error"]["request_id"]
            assert "traceback" not in resp.text.lower()

    def test_unexpected_error_never_leaks_details(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.services import auth_service

        def _boom(db, email, password):
            raise RuntimeError("SELECT * FROM users blew up 'test-secret'")

        monkeypatch.setattr(auth_service, "register", _boom)
        with TestClient(app, raise_server_exceptions=False) as client:
            resp = client.post(
                "/auth/register",
                json={"email": f"boom-{uuid.uuid4()}@example.com", "password": "supersecurepw"},
            )
            assert resp.status_code == 500
            body = resp.json()
            assert body["error"]["code"] == "internal_error"
            assert body["error"]["message"] == "Something went wrong"
            assert body["error"]["request_id"]
            assert "SELECT" not in resp.text
            assert "test-secret" not in resp.text
            assert "traceback" not in resp.text.lower()

    def test_app_error_envelope_includes_request_id(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"rid-{uuid.uuid4()}@example.com")
            resp = client.get(f"/workouts/{uuid.uuid4()}", headers=_auth_headers(tokens))
            assert resp.status_code == 404
            assert resp.json()["error"]["request_id"]


class TestAccessLog:
    def test_json_access_line(self, db_session: Session) -> None:
        messages: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record: logging.LogRecord) -> None:
                messages.append(record.getMessage())

        handler = _Capture()
        logger = logging.getLogger("liftlog.access")
        logger.addHandler(handler)
        try:
            with TestClient(app) as client:
                tokens = _register(client, f"log-{uuid.uuid4()}@example.com")
                headers = _auth_headers(tokens)
                me = client.get("/me", headers=headers).json()
                resp = client.get("/me", headers=headers)
                assert resp.status_code == 200
        finally:
            logger.removeHandler(handler)
        lines = [json.loads(message) for message in messages]
        assert lines, "expected at least one access log line"
        entry = lines[-1]
        assert entry["method"] == "GET"
        assert entry["route"] == "/me"
        assert entry["status"] == 200
        assert entry["request_id"] == resp.headers["X-Request-ID"]
        assert entry["user_id"] == me["id"]
        assert isinstance(entry["duration_ms"], (int, float))


class TestExtraForbid:
    REQUEST_SUFFIXES = ("In", "Create", "Update", "Patch", "Request")

    def test_every_request_body_rejects_unknown_fields(self) -> None:
        import importlib

        checked: list[str] = []
        for module_name in ("auth", "user", "workout", "exercise", "template", "ai"):
            module = importlib.import_module(f"app.schemas.{module_name}")
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if obj.__module__ != module.__name__:
                    continue
                if not (isinstance(obj, type) and issubclass(obj, pydantic.BaseModel)):
                    continue
                if not name.endswith(self.REQUEST_SUFFIXES):
                    continue
                checked.append(f"{module_name}.{name}")
                assert obj.model_config.get("extra") == "forbid", name
        assert len(checked) >= 20, f"expected to audit request models, got {checked}"


class TestCORSPolicy:
    def test_wildcard_origin_rejected(self) -> None:
        with pytest.raises(pydantic.ValidationError):
            config_module.Settings(
                database_url="postgresql://x",
                auth_secret="x",
                cors_origins="https://app.example.com, *",
            )

    def test_explicit_origins_accepted(self) -> None:
        settings = config_module.Settings(
            database_url="postgresql://x",
            auth_secret="x",
            cors_origins="https://lift-log-ai.vercel.app",
        )
        assert settings.cors_origin_list == ["https://lift-log-ai.vercel.app"]


class TestSecretsHygiene:
    def test_secrets_appear_in_no_response(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"sec-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            bodies = [
                client.get("/me", headers=headers).text,
                client.get("/export", headers=headers).text,
            ]
            spec_text = json.dumps(app.openapi())
            for body in bodies + [spec_text]:
                assert "test-secret" not in body
                assert "postgresql+psycopg://liftlog:liftlog" not in body
