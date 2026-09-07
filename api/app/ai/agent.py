import json
from collections.abc import Callable
from dataclasses import dataclass, field

from app.ai.payloads import ChatMessage
from app.ai.tools import MAX_TOOL_ROUNDS, ToolCallTrace, parse_agent_response

CompleteFn = Callable[[str, list[ChatMessage]], str]
ExecuteFn = Callable[[str, dict[str, object]], dict[str, object]]

_FALLBACK_ANSWER = (
    "I couldn't pin that down from your logged training. "
    "Try asking about a specific exercise, period, or muscle group."
)


@dataclass
class AgentResult:
    answer: str
    trace: list[ToolCallTrace] = field(default_factory=list)
    rounds_used: int = 0


def normalize_history(history: list[ChatMessage]) -> list[ChatMessage]:
    """Merge consecutive same-role messages so providers that require strict
    user/assistant alternation never see a violation."""
    normalized: list[ChatMessage] = []
    for message in history:
        if normalized and normalized[-1].role == message.role:
            merged = normalized[-1].content + "\n\n" + message.content
            normalized[-1] = ChatMessage(role=message.role, content=merged)
        else:
            normalized.append(message)
    return normalized


def run_agent(
    complete: CompleteFn,
    execute: ExecuteFn,
    system: str,
    message: str,
    history: list[ChatMessage],
    max_rounds: int = MAX_TOOL_ROUNDS,
) -> AgentResult:
    """Tool-calling loop over injected functions. `complete` talks to the
    model, `execute` runs a named tool. Stops at the first answer or when
    `max_rounds` tool rounds are used, then forces a final answer."""
    conversation = normalize_history([*history, ChatMessage(role="user", content=message)])
    trace: list[ToolCallTrace] = []

    for round_no in range(1, max_rounds + 1):
        text = complete(system, conversation)
        action = parse_agent_response(text)
        if action.kind == "answer":
            return AgentResult(answer=action.answer, trace=trace, rounds_used=round_no)
        if action.kind == "invalid":
            conversation.append(ChatMessage(role="assistant", content=text[:2000]))
            conversation.append(
                ChatMessage(
                    role="user",
                    content=(
                        "That was not valid. Reply with exactly one JSON object: "
                        '{"answer": "..."} or {"tool_calls": [{"name": "...", "arguments": {}}]}.'
                    ),
                )
            )
            continue
        results: list[dict[str, object]] = []
        for call in action.tool_calls:
            try:
                result = execute(call.name, call.arguments)
            except Exception as exc:
                result = {"error": "tool_failed", "message": str(exc)[:200]}
            if not isinstance(result, dict):
                result = {"result": result}
            trace.append(
                ToolCallTrace(
                    round=round_no, name=call.name, arguments=call.arguments, result=result
                )
            )
            results.append({"tool": call.name, "result": result})
        conversation.append(ChatMessage(role="assistant", content=text[:4000]))
        conversation.append(
            ChatMessage(role="user", content="Tool results:\n" + json.dumps(results)[:12000])
        )

    closing = complete(
        system + "\nNo more tool calls are available. Answer now with "
        '{"answer": "..."} using only data already shown.',
        conversation,
    )
    closing_action = parse_agent_response(closing)
    if closing_action.kind == "answer":
        return AgentResult(answer=closing_action.answer, trace=trace, rounds_used=max_rounds)
    return AgentResult(answer=_FALLBACK_ANSWER, trace=trace, rounds_used=max_rounds)
