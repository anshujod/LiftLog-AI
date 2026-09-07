import json
import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.agent import normalize_history, run_agent
from app.ai.payloads import ChatMessage
from app.ai.service import get_ai_service
from app.ai.tools import MAX_TOOL_ROUNDS, build_agent_system_prompt, parse_agent_response
from app.ai.tools.resolve import resolve_exercise
from app.db.models import Exercise
from app.main import app


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


def _seed_workout(
    client: TestClient,
    tokens: dict,
    exercise_id: uuid.UUID,
    sets: list[dict],
    performed_on: date | None = None,
) -> str:
    headers = _auth_headers(tokens)
    workout = client.post("/workouts", headers=headers, json={}).json()
    if performed_on is not None:
        patched = client.patch(
            f"/workouts/{workout['id']}", headers=headers, json={"performed_on": str(performed_on)}
        )
        assert patched.status_code == 200
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


def _ask(client: TestClient, tokens: dict, message: str, history: list[dict] | None = None) -> dict:
    resp = client.post(
        "/ai/chat",
        headers=_auth_headers(tokens),
        json={"message": message, "history": history or []},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestResolveExercise:
    def test_exact_and_alias_match(self) -> None:
        visible = [(uuid.uuid4(), "Bench Press"), (uuid.uuid4(), "Squat")]
        bench_id = visible[0][0]
        assert resolve_exercise(visible, "Bench Press") == (bench_id, [])
        assert resolve_exercise(visible, "flat bench") == (bench_id, [])
        assert resolve_exercise(visible, "squat") == (visible[1][0], [])

    def test_ambiguous_returns_candidates(self) -> None:
        visible = [
            (uuid.uuid4(), "Barbell Curl"),
            (uuid.uuid4(), "Dumbbell Curl"),
            (uuid.uuid4(), "Bench Press"),
        ]
        exercise_id, candidates = resolve_exercise(visible, "curl")
        assert exercise_id is None
        assert {name for _, name in candidates} == {"Barbell Curl", "Dumbbell Curl"}

    def test_unknown_returns_empty(self) -> None:
        visible = [(uuid.uuid4(), "Bench Press")]
        assert resolve_exercise(visible, "ZzzLift") == (None, [])


class TestAgentProtocol:
    def test_parse_answer_and_tool_calls(self) -> None:
        action = parse_agent_response('{"answer": "hello"}')
        assert action.kind == "answer" and action.answer == "hello"
        action = parse_agent_response(
            '```json\n{"tool_calls": [{"name": "get_prs", "arguments": {}}]}\n```'
        )
        assert action.kind == "tool_calls" and action.tool_calls[0].name == "get_prs"
        assert parse_agent_response("just some prose").kind == "invalid"
        assert parse_agent_response('{"unrelated": 1}').kind == "invalid"

    def test_round_cap_with_stubborn_model(self) -> None:
        calls = {"count": 0}

        def complete(system: str, messages: list[ChatMessage]) -> str:
            _ = (system, messages)
            calls["count"] += 1
            return json.dumps({"tool_calls": [{"name": "get_prs", "arguments": {}}]})

        def execute(name: str, arguments: dict) -> dict:
            return {"tool": name, "arguments": arguments}

        result = run_agent(complete, execute, "system", "hi", [])
        assert len([t for t in result.trace]) == MAX_TOOL_ROUNDS
        assert result.answer
        assert calls["count"] == MAX_TOOL_ROUNDS + 1

    def test_unknown_tool_becomes_data_error(self) -> None:
        script = [
            json.dumps({"tool_calls": [{"name": "nope", "arguments": {}}]}),
            json.dumps({"answer": "done"}),
        ]

        def complete(system: str, messages: list[ChatMessage]) -> str:
            _ = (system, messages)
            return script.pop(0)

        seen: list[dict] = []

        def execute(name: str, arguments: dict) -> dict:
            seen.append({"name": name, "arguments": arguments})
            return {"error": "unknown_tool", "message": f"no tool named '{name}'"}

        result = run_agent(complete, execute, "system", "hi", [])
        assert result.answer == "done"
        assert seen[0]["name"] == "nope"

    def test_normalize_history_merges_same_role(self) -> None:
        merged = normalize_history(
            [
                ChatMessage(role="user", content="a"),
                ChatMessage(role="user", content="b"),
                ChatMessage(role="assistant", content="c"),
            ]
        )
        assert [(m.role, m.content) for m in merged] == [("user", "a\n\nb"), ("assistant", "c")]

    def test_system_prompt_lists_tools(self) -> None:
        prompt = build_agent_system_prompt("kg", "2026-09-07")
        assert "get_exercise_history" in prompt and "detect_plateaus" in prompt
        assert "kg" in prompt


class TestChatEndpoint:
    def test_progress_question_grounded(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"chat-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                for load in (70000, 75000, 80000):
                    _seed_workout(client, tokens, bench_id, [{"load_g": load, "reps": 5}])
                body = _ask(client, tokens, "How much has my Bench Press improved?")
                assert "Bench Press" in body["answer"]
                assert any(t["name"] == "get_progress" for t in body["tool_trace"])
                for number in _numbers(body["answer"]):
                    assert number in json.dumps(body), f"{number} not grounded"
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_last_squat_at_load(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"squat-{uuid.uuid4()}@example.com")
                squat_id = _exercise_id(db_session, "Squat")
                target = date.today() - timedelta(days=9)
                _seed_workout(client, tokens, squat_id, [{"load_g": 100000, "reps": 5}], target)
                _seed_workout(client, tokens, squat_id, [{"load_g": 90000, "reps": 5}])
                body = _ask(client, tokens, "When did I last squat 100 kg?")
                assert target.isoformat() in body["answer"]
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_muscle_distribution(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"dist-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_workout(client, tokens, bench_id, [{"load_g": 80000, "reps": 5}])
                body = _ask(client, tokens, "Which muscle groups am I training most?")
                assert "Chest" in body["answer"]
                assert any(t["name"] == "get_muscle_group_distribution" for t in body["tool_trace"])
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_plateau_detected(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"plat-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                for week in range(7):
                    _seed_workout(
                        client,
                        tokens,
                        bench_id,
                        [{"load_g": 80000, "reps": 5}],
                        date.today() - timedelta(weeks=week),
                    )
                body = _ask(client, tokens, "Have I plateaued anywhere?")
                assert "Bench Press" in body["answer"]
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_ambiguous_exercise_asks_for_clarification(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"amb-{uuid.uuid4()}@example.com")
                curl_id = _exercise_id(db_session, "Barbell Curl")
                _seed_workout(client, tokens, curl_id, [{"load_g": 30000, "reps": 10}])
                body = _ask(client, tokens, "What is my curl best?")
                assert "Curl" in body["answer"]
                assert "30000" not in body["answer"]
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_cross_user_data_never_leaks(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                owner = _register(client, f"own-{uuid.uuid4()}@example.com")
                asker = _register(client, f"ask-{uuid.uuid4()}@example.com")
                bench_id = _exercise_id(db_session, "Bench Press")
                _seed_workout(client, owner, bench_id, [{"load_g": 212500, "reps": 1}])
                body = _ask(client, asker, "What is my Bench Press best?")
                assert "212.5" not in body["answer"]
                assert "212500" not in json.dumps(body["tool_trace"])
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_empty_history_answers_honestly(self, db_session: Session) -> None:
        from app.ai.providers.stub import StubAIService

        with TestClient(app) as client:
            app.dependency_overrides[get_ai_service] = StubAIService
            try:
                tokens = _register(client, f"new-{uuid.uuid4()}@example.com")
                body = _ask(client, tokens, "How much has my Bench Press improved?")
                assert "not enough" in body["answer"].lower()
            finally:
                app.dependency_overrides.pop(get_ai_service, None)

    def test_validation(self, db_session: Session) -> None:
        with TestClient(app) as client:
            tokens = _register(client, f"val-{uuid.uuid4()}@example.com")
            headers = _auth_headers(tokens)
            assert client.post("/ai/chat", headers=headers, json={"message": ""}).status_code == 422
            big = [{"role": "user", "content": "hi"}] * 21
            assert (
                client.post(
                    "/ai/chat", headers=headers, json={"message": "hi", "history": big}
                ).status_code
                == 422
            )
            assert client.post("/ai/chat", json={"message": "hi"}).status_code in (401, 403)


def _numbers(text: str) -> list[str]:
    import re

    return re.compile(r"\d+(?:\.\d+)?").findall(text)
