import ast
import json
import logging
import re
import uuid
from pathlib import Path
from types import SimpleNamespace

import httpx
import openai
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers.openrouter import OpenRouterAIService
from app.ai.providers.stub import StubAIService
from app.ai.service import PROMPT_VERSION, get_ai_service, load_system_prompt
from app.core import config as config_module
from app.core.errors import AIUnavailableError
from app.db.models import Exercise
from app.main import app

AI_DIR = Path(__file__).resolve().parent.parent / "app" / "ai"

_NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")

_BANNED_PHRASES = ("guarantee", "definitely will", "you must", "diagnos", "injury")


def _register(client: TestClient, email: str) -> dict:
    resp = client.post("/auth/register", json={"email": email, "password": "supersecurepw"})
    assert resp.status_code == 200
    return resp.json()


def _auth_headers(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _exercise_id(db_session: Session, name: str) -> uuid.UUID:
    exercise = db_session.scalar(
        select(Exercise).where(Exercise.name == name, Exercise.user_id.is_(None))
    )
    assert exercise is not None
    return exercise.id


def _seed_finished_workout(
    client: TestClient, tokens: dict, exercise_id: uuid.UUID, sets: list[dict]
) -> str:
    headers = _auth_headers(tokens)
    workout = client.post("/workouts", headers=headers, json={}).json()
    we = client.post(
        f"/workouts/{workout['id']}/exercises",
        headers=headers,
        json={"exercise_id": str(exercise_id)},
    ).json()
    bulk = client.post(f"/workout-exercises/{we['id']}/sets/bulk", headers=headers, json=sets)
    assert bulk.status_code == 200
    finish = client.post(f"/workouts/{workout['id']}/finish", headers=headers)
    assert finish.status_code == 200
    return workout["id"]


def _numbers(text: str) -> list[str]:
    return _NUMBER_RE.findall(text)


class TestPromptContract:
    def test_system_prompt_states_grounding_rules(self) -> None:
        prompt = load_system_prompt("analyze_progress", PROMPT_VERSION).lower()
        assert "verbatim" in prompt
        assert "say so plainly" in prompt
        assert '"may"' in prompt or "may" in prompt
        assert "medical" in prompt
        assert "computed facts" in prompt and "interpretation" in prompt

    def test_ai_layer_imports_no_database(self) -> None:
        forbidden = ("sqlalchemy", "app.db", "app.repositories", "app.services")
        for path in (*AI_DIR.glob("*.py"), *AI_DIR.glob("providers/*.py")):
            tree = ast.parse(path.read_text())
            imported = set()
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    imported.add(node.module)
                elif isinstance(node, ast.Import):
                    imported.update(alias.name for alias in node.names)
            assert not any(
                mod == bad or mod.startswith(bad + ".") for mod in imported for bad in forbidden
            ), f"{path.name} reaches past the analytics boundary"


class TestStubGrounding:
    def test_summary_numbers_all_appear_in_payload(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"ground-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                for _ in range(3):
                    _seed_finished_workout(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                resp = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(tokens),
                    json={"period": "90d"},
                )
                assert resp.status_code == 200, resp.text
                body = resp.json()
                payload_text = resp.text
                for number in _numbers(body["insight"]["summary"]):
                    assert number in payload_text, f"{number} not grounded in payload"
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_summary_uses_hedged_language(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"hedge-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                for _ in range(3):
                    _seed_finished_workout(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                summary = (
                    client.post(
                        "/ai/analyze-progress",
                        headers=_auth_headers(tokens),
                        json={"period": "90d"},
                    )
                    .json()["insight"]["summary"]
                    .lower()
                )
                assert any(word in summary for word in ("may", "appears", "consider"))
                assert not any(phrase in summary for phrase in _BANNED_PHRASES)
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_insufficient_data_declines_a_trend(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"thin-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished_workout(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                body = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(tokens),
                    json={"period": "90d"},
                ).json()
                assert body["payload"]["has_sufficient_data"] is False
                assert "not enough" in body["insight"]["summary"].lower()
            finally:
                app.dependency_overrides.pop(get_ai_service, None)


class TestAnalyzeProgressEndpoint:
    def test_returns_insight_and_grounding_payload(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"e2e-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_finished_workout(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                resp = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(tokens),
                    json={"period": "90d", "exercise_id": str(bench_id)},
                )
                assert resp.status_code == 200, resp.text
                body = resp.json()
                assert body["insight"]["model"] == "stub"
                assert body["insight"]["prompt_version"] == PROMPT_VERSION
                assert body["payload"]["unit"] == "kg"
                assert body["payload"]["focus_exercise"]["exercise_name"] == "Bench Press"
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_foreign_exercise_returns_404(self, db_session: Session) -> None:
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                owner = _register(client, f"owner-{uuid.uuid4()}@example.com")
                intruder = _register(client, f"intruder-{uuid.uuid4()}@example.com")
                custom = client.post(
                    "/exercises",
                    headers=_auth_headers(owner),
                    json={
                        "muscle_group_id": 1,
                        "name": f"Secret Lift {uuid.uuid4()}",
                        "load_type": "barbell_total",
                    },
                ).json()
                resp = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(intruder),
                    json={"period": "90d", "exercise_id": custom["id"]},
                )
                assert resp.status_code == 404
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_invalid_period_rejected(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"period-{uuid.uuid4()}@example.com")
            resp = client.post(
                "/ai/analyze-progress",
                headers=_auth_headers(tokens),
                json={"period": "fortnight"},
            )
            assert resp.status_code == 422

    def test_missing_key_degrades_to_503(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Force-empty: process env wins over the .env file, so a real local
        # key can never leak a network call into this test.
        monkeypatch.setenv("AI_API_KEY", "")
        config_module.get_settings.cache_clear()
        try:
            with TestClient(app) as client:
                tokens = _register(client, f"nokey-{uuid.uuid4()}@example.com")
                resp = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(tokens),
                    json={"period": "90d"},
                )
                assert resp.status_code == 503
                assert resp.json()["error"]["code"] == "ai_unavailable"
        finally:
            config_module.get_settings.cache_clear()

    def test_factory_without_key_raises_unavailable(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.ai.service import UnavailableAIService

        monkeypatch.setenv("AI_API_KEY", "")
        config_module.get_settings.cache_clear()
        try:
            service = get_ai_service()
            assert isinstance(service, UnavailableAIService)
            try:
                service.analyze_progress(None)  # type: ignore[arg-type]
            except AIUnavailableError as exc:
                assert exc.status_code == 503
            else:
                raise AssertionError("expected AIUnavailableError")
        finally:
            config_module.get_settings.cache_clear()


def _fake_openai_client(text: str | None = None, error: Exception | None = None) -> SimpleNamespace:
    class _Completions:
        def create(self, **kwargs: object) -> SimpleNamespace:
            if error is not None:
                raise error
            message = SimpleNamespace(content=text)
            return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    return SimpleNamespace(chat=SimpleNamespace(completions=_Completions()))


class TestOpenRouterProvider:
    def test_factory_selects_provider_from_config(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app.ai.providers.anthropic import AnthropicAIService

        monkeypatch.setenv("AI_API_KEY", "test-key")
        monkeypatch.setenv("AI_PROVIDER", "openrouter")
        config_module.get_settings.cache_clear()
        try:
            assert isinstance(get_ai_service(), OpenRouterAIService)
        finally:
            config_module.get_settings.cache_clear()

        monkeypatch.setenv("AI_PROVIDER", "anthropic")
        config_module.get_settings.cache_clear()
        try:
            assert isinstance(get_ai_service(), AnthropicAIService)
        finally:
            config_module.get_settings.cache_clear()

    def test_grounded_summary_through_endpoint(self, db_session: Session) -> None:
        service = OpenRouterAIService(
            api_key="test-key",
            model="test-model",
            client=_fake_openai_client("Bench Press may be improving, 3 sessions in 90d."),
        )
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = lambda: service
            try:
                tokens = _register(client, f"or-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                for _ in range(3):
                    _seed_finished_workout(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                resp = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(tokens),
                    json={"period": "90d"},
                )
                assert resp.status_code == 200, resp.text
                body = resp.json()
                assert body["insight"]["model"] == "test-model"
                for number in _numbers(body["insight"]["summary"]):
                    assert number in resp.text, f"{number} not grounded in payload"
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_auth_failure_maps_to_503(self, db_session: Session) -> None:
        response = httpx.Response(401, request=httpx.Request("POST", "https://x.test"))
        service = OpenRouterAIService(
            api_key="bad-key",
            model="test-model",
            client=_fake_openai_client(
                error=openai.AuthenticationError("unauthorized", response=response, body=None)
            ),
        )
        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = lambda: service
            try:
                tokens = _register(client, f"or401-{uuid.uuid4()}@example.com")
                resp = client.post(
                    "/ai/analyze-progress",
                    headers=_auth_headers(tokens),
                    json={"period": "90d"},
                )
                assert resp.status_code == 503
                assert resp.json()["error"]["code"] == "ai_unavailable"
            finally:
                app.dependency_overrides.pop(get_ai_service, None)


def _fake_openai_client_with_usage(
    text: str, prompt_tokens: int | None, completion_tokens: int | None
) -> SimpleNamespace:
    class _Completions:
        def create(self, **kwargs: object) -> SimpleNamespace:
            message = SimpleNamespace(content=text)
            choices = [SimpleNamespace(message=message)]
            if prompt_tokens is None and completion_tokens is None:
                return SimpleNamespace(choices=choices)
            return SimpleNamespace(
                choices=choices,
                usage=SimpleNamespace(
                    prompt_tokens=prompt_tokens, completion_tokens=completion_tokens
                ),
            )

    return SimpleNamespace(chat=SimpleNamespace(completions=_Completions()))


class TestUsageLogging:
    def test_llm_call_logs_tokens_per_operation(self, caplog: pytest.LogCaptureFixture) -> None:
        from app.ai.payloads import ChatMessage

        service = OpenRouterAIService(
            api_key="test-key",
            model="test-model",
            client=_fake_openai_client_with_usage("hello", 10, 5),
        )
        with caplog.at_level(logging.INFO, logger="liftlog.ai"):
            assert service.complete("sys", [ChatMessage(role="user", content="hi")]) == "hello"
        records = [r for r in caplog.records if r.name == "liftlog.ai"]
        assert len(records) == 1
        event = json.loads(records[0].getMessage())
        assert event == {
            "event": "llm_usage",
            "provider": "openrouter",
            "model": "test-model",
            "operation": "chat",
            "input_tokens": 10,
            "output_tokens": 5,
        }

    def test_missing_usage_does_not_break_the_call(self, caplog: pytest.LogCaptureFixture) -> None:
        from app.ai.payloads import ChatMessage

        service = OpenRouterAIService(
            api_key="test-key",
            model="test-model",
            client=_fake_openai_client_with_usage("hello", None, None),
        )
        with caplog.at_level(logging.INFO, logger="liftlog.ai"):
            assert service.complete("sys", [ChatMessage(role="user", content="hi")]) == "hello"
        events = [json.loads(r.getMessage()) for r in caplog.records if r.name == "liftlog.ai"]
        assert events[0]["input_tokens"] is None
        assert events[0]["output_tokens"] is None
