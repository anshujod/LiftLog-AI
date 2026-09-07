import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_TOOL_ROUNDS = 5
MAX_TOOLS_PER_ROUND = 4


class ToolDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    parameters: dict[str, Any]


TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name="get_exercise_history",
        description="Past completed sessions for one exercise, newest first, with sets.",
        parameters={
            "type": "object",
            "properties": {
                "exercise_name": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 8, "default": 5},
            },
            "required": ["exercise_name"],
        },
    ),
    ToolDefinition(
        name="get_last_workout",
        description="The most recent completed session for one exercise.",
        parameters={
            "type": "object",
            "properties": {"exercise_name": {"type": "string"}},
            "required": ["exercise_name"],
        },
    ),
    ToolDefinition(
        name="get_personal_records",
        description="All-time bests (weight, rep, estimated 1RM, session volume) for one exercise.",
        parameters={
            "type": "object",
            "properties": {"exercise_name": {"type": "string"}},
            "required": ["exercise_name"],
        },
    ),
    ToolDefinition(
        name="get_progress",
        description="Trend for one exercise over a period: start, current, change, direction.",
        parameters={
            "type": "object",
            "properties": {
                "exercise_name": {"type": "string"},
                "period": {
                    "type": "string",
                    "enum": ["30d", "90d", "1y", "all"],
                    "default": "90d",
                },
            },
            "required": ["exercise_name"],
        },
    ),
    ToolDefinition(
        name="get_volume",
        description="Total volume for one muscle group over a period.",
        parameters={
            "type": "object",
            "properties": {
                "muscle_group": {"type": "string"},
                "period": {
                    "type": "string",
                    "enum": ["30d", "90d", "1y", "all"],
                    "default": "30d",
                },
            },
            "required": ["muscle_group"],
        },
    ),
    ToolDefinition(
        name="get_recent_workouts",
        description="Most recent finished workouts with date, title, and exercise count.",
        parameters={
            "type": "object",
            "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5}},
        },
    ),
    ToolDefinition(
        name="get_prs",
        description="Personal records set within a period, newest first.",
        parameters={
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["30d", "90d", "1y", "all"],
                    "default": "30d",
                }
            },
        },
    ),
    ToolDefinition(
        name="detect_plateaus",
        description="Exercises with no meaningful improvement over a long window.",
        parameters={"type": "object", "properties": {}},
    ),
    ToolDefinition(
        name="get_muscle_group_distribution",
        description="Volume and working-set counts per muscle group over a period.",
        parameters={
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["30d", "90d", "1y", "all"],
                    "default": "30d",
                }
            },
        },
    ),
]


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolCallTrace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    round: int
    name: str
    arguments: dict[str, Any]
    result: dict[str, Any]


class AgentAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["answer", "tool_calls", "invalid"]
    answer: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)


def build_agent_system_prompt(unit: str, today: str) -> str:
    lines = [
        "You answer questions about the user's strength training by calling data tools.",
        "Every number in your answer must come from a tool result shown in this",
        "conversation. Never invent a number, date, or exercise name.",
        "If the needed data is not in any tool result, say so plainly.",
        "Use hedged language — 'may', 'appears', 'consider' — and never make",
        "medical, diagnostic, or authoritative training claims.",
        f"The user displays loads in {unit}. Today is {today}.",
        "",
        "Reply with exactly one JSON object, no other text:",
        '  {"answer": "<final answer, no further tools needed>"}',
        "or",
        '  {"tool_calls": [{"name": "<tool>", "arguments": {}}]}',
        "",
        "Available tools:",
    ]
    for tool in TOOL_DEFINITIONS:
        lines.append(f"- {tool.name}{json.dumps(tool.parameters)}: {tool.description}")
    return "\n".join(lines)


def parse_agent_response(text: str) -> AgentAction:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = _strip_fences(cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        return AgentAction(kind="invalid")
    if not isinstance(data, dict):
        return AgentAction(kind="invalid")
    answer = data.get("answer")
    if isinstance(answer, str) and answer.strip():
        return AgentAction(kind="answer", answer=answer.strip())
    raw_calls = data.get("tool_calls")
    if isinstance(raw_calls, list) and raw_calls:
        calls: list[ToolCall] = []
        for raw in raw_calls[:MAX_TOOLS_PER_ROUND]:
            if not isinstance(raw, dict) or not isinstance(raw.get("name"), str):
                continue
            arguments = raw.get("arguments")
            calls.append(
                ToolCall(
                    name=raw["name"],
                    arguments=arguments if isinstance(arguments, dict) else {},
                )
            )
        if calls:
            return AgentAction(kind="tool_calls", tool_calls=calls)
    return AgentAction(kind="invalid")


def _strip_fences(text: str) -> str:
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()
