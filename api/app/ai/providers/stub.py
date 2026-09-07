import json
import re
from typing import Any

from app.ai.payloads import ChatMessage, Insight, ProgressAnalysisPayload, Recommendation
from app.ai.service import PROMPT_VERSION, utcnow
from app.core.errors import AIUnavailableError

_STUB_MODEL = "stub"

_MUSCLE_KEYWORDS = ("chest", "back", "legs", "shoulders", "biceps", "triceps")

_EXERCISE_HINTS = (
    ("bench press", "Bench Press"),
    ("overhead press", "Overhead Press"),
    ("shoulder press", "Shoulder Press"),
    ("lateral raise", "Lateral Raise"),
    ("leg press", "Leg Press"),
    ("leg curl", "Leg Curl"),
    ("lat pulldown", "Lat Pulldown"),
    ("pull-up", "Pull-ups"),
    ("pullup", "Pull-ups"),
    ("bench", "bench"),
    ("squat", "squat"),
    ("deadlift", "deadlift"),
    ("curl", "curl"),
    ("row", "row"),
    ("press", "press"),
    ("dip", "dip"),
    ("raise", "raise"),
)

_KG_RE = re.compile(r"(\d+(?:\.\d+)?)\s*kg")
_LB_RE = re.compile(r"(\d+(?:\.\d+)?)\s*lb")
_LB_TO_G = 453.592
_PR_RE = re.compile(r"\bprs?\b|personal record|\brecord\b|\bbest\b")


class StubAIService:
    """Deterministic stand-in for tests. Builds its summary purely by
    formatting numbers already present in the payload, so grounding checks
    can run without network access or a provider key."""

    def __init__(self, model: str = _STUB_MODEL) -> None:
        self._model = model
        self.model_name = model

    def complete(self, system: str, messages: list[ChatMessage]) -> str:
        _ = system
        question = _latest_question(messages)
        results = _latest_tool_results(messages)
        if results is not None:
            return json.dumps({"answer": _compose(question, results)})
        calls = _plan_calls(question)
        return json.dumps({"tool_calls": calls})

    def analyze_progress(self, payload: ProgressAnalysisPayload) -> Insight:
        return Insight(
            summary=_summarize(payload),
            model=self._model,
            prompt_version=PROMPT_VERSION,
            generated_at=utcnow(),
        )

    def answer_workout_question(self, question: str, payload: ProgressAnalysisPayload) -> Insight:
        raise AIUnavailableError("AI analysis is unavailable right now")

    def recommend_workout(self, payload: ProgressAnalysisPayload) -> Recommendation:
        raise AIUnavailableError("AI analysis is unavailable right now")

    def summarize_training(self, payload: ProgressAnalysisPayload) -> Insight:
        return self.analyze_progress(payload)


def _summarize(payload: ProgressAnalysisPayload) -> str:
    dashboard = payload.dashboard
    if not payload.has_sufficient_data:
        return (
            f"There is not enough logged training in this {payload.period} window "
            f"({payload.session_count} sessions) to describe a trend. "
            "Consider logging at least 3 sessions for an exercise before reading "
            "much into its direction."
        )

    facts = (
        f"Measured over the last {dashboard.period_days} days "
        f"({dashboard.workout_count} workouts, in {payload.unit}): "
        f"this week {dashboard.weekly_volume.current_week.display} vs "
        f"last week {dashboard.weekly_volume.previous_week.display}."
    )
    reading = ""
    if dashboard.top_improving_exercises:
        top = dashboard.top_improving_exercises[0]
        reading += (
            f" {top.exercise_name} appears to be improving "
            f"(+{top.percent_change}% on {top.metric}); "
            "that may reflect recent consistency, though short windows can mislead."
        )
    if payload.plateaus:
        plateau = payload.plateaus[0]
        reading += (
            f" {plateau.exercise_name} shows no new best in "
            f"{plateau.weeks_since_new_best} weeks across {plateau.session_count} "
            f"sessions over {plateau.window_days} days — "
            "consider varying load or reps if progress matters to you."
        )
    if not reading:
        reading = " No clear improvement or plateau stands out; steady logging may reveal more."
    return facts + reading


def _latest_question(messages: list[ChatMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user" and not message.content.startswith("Tool results:"):
            return message.content
    return ""


def _latest_tool_results(messages: list[ChatMessage]) -> list[dict[str, Any]] | None:
    for message in reversed(messages):
        if message.role == "user" and message.content.startswith("Tool results:"):
            try:
                results = json.loads(message.content[len("Tool results:") :])
            except json.JSONDecodeError:
                return []
            return results if isinstance(results, list) else []
    return None


def _plan_calls(question: str) -> list[dict[str, Any]]:
    text = question.lower()
    hint = _exercise_hint(text)
    calls: list[dict[str, Any]] = []
    if any(word in text for word in ("plateau", "stuck", "stalled")):
        calls.append({"name": "detect_plateaus", "arguments": {}})
    if any(word in text for word in ("muscle", "train most", "training most", "distribution")):
        calls.append({"name": "get_muscle_group_distribution", "arguments": {"period": "30d"}})
    for slug in _MUSCLE_KEYWORDS:
        if slug in text and "volume" in text:
            calls.append({"name": "get_volume", "arguments": {"muscle_group": slug}})
            break
    if any(word in text for word in ("progress", "improv", "stronger")) and hint is not None:
        calls.append(
            {"name": "get_progress", "arguments": {"exercise_name": hint, "period": "90d"}}
        )
    if _PR_RE.search(text):
        if hint is not None:
            calls.append({"name": "get_personal_records", "arguments": {"exercise_name": hint}})
        else:
            calls.append({"name": "get_prs", "arguments": {"period": "90d"}})
    if any(word in text for word in ("last", "when")):
        if hint is not None:
            calls.append({"name": "get_exercise_history", "arguments": {"exercise_name": hint}})
        else:
            calls.append({"name": "get_recent_workouts", "arguments": {"limit": 5}})
    if not calls:
        calls.append({"name": "get_recent_workouts", "arguments": {"limit": 5}})
    return calls[:3]


def _exercise_hint(text: str) -> str | None:
    for keyword, hint in _EXERCISE_HINTS:
        if keyword in text:
            return hint
    return None


def _target_load_g(question: str) -> int | None:
    match = _KG_RE.search(question.lower())
    if match:
        return int(float(match.group(1)) * 1000)
    match = _LB_RE.search(question.lower())
    if match:
        return int(float(match.group(1)) * _LB_TO_G)
    return None


def _compose(question: str, results: list[dict[str, Any]]) -> str:
    sentences: list[str] = []
    for entry in results:
        result = entry.get("result")
        if not isinstance(result, dict):
            continue
        if "error" in result:
            sentences.append(_describe_error(result))
            continue
        formatted = _format_tool_result(str(entry.get("tool")), result, question)
        if formatted:
            sentences.append(formatted)
    if not sentences:
        return "I couldn't find that in your logged training."
    return " ".join(sentences[:4])


def _describe_error(result: dict[str, Any]) -> str:
    if result.get("error") == "unknown_exercise":
        return f"I don't have an exercise matching '{result.get('exercise_name', '')}'."
    if result.get("error") == "ambiguous_exercise":
        candidates = result.get("candidates", [])
        names = ", ".join(str(c.get("exercise_name")) for c in candidates[:3])
        return f"Did you mean {names}?"
    return "I couldn't fetch that — try rephrasing the question."


def _format_tool_result(tool: str, result: dict[str, Any], question: str) -> str:
    if tool == "get_progress":
        progression = result.get("progression", {})
        if not progression.get("has_data"):
            return f"There are not enough {result.get('exercise_name')} sessions to judge progress."
        return (
            f"{result.get('exercise_name')} appears {progression.get('direction')} "
            f"({progression.get('percent_change')}% on {progression.get('metric')})."
        )
    if tool == "get_exercise_history":
        return _format_history(result, question)
    if tool == "get_last_workout":
        session = result.get("session")
        if not result.get("has_data") or not isinstance(session, dict):
            return f"You have not logged {result.get('exercise_name')} yet."
        volume = session.get("volume", {})
        return (
            f"You last did {result.get('exercise_name')} on {session.get('performed_on')} "
            f"({volume.get('display', '')})."
        )
    if tool == "get_personal_records":
        weight_pr = result.get("weight_pr")
        if not isinstance(weight_pr, dict):
            return ""
        load = weight_pr.get("load", {})
        return (
            f"Your {result.get('exercise_name')} best is {load.get('display', '')} "
            f"for {weight_pr.get('reps')} reps on {weight_pr.get('performed_on')}."
        )
    if tool == "get_prs":
        prs = result.get("prs", [])
        if not prs:
            return "No personal records in that window."
        first = prs[0]
        return (
            f"{len(prs)} recent PRs, latest {first.get('exercise_name')} "
            f"{first.get('value', {}).get('display', '')} on {first.get('performed_on')}."
        )
    if tool == "detect_plateaus":
        plateaus = result.get("plateaus", [])
        if not plateaus:
            return "No plateaus detected."
        first = plateaus[0]
        return (
            f"{first.get('exercise_name')} may have plateaued — no new best in "
            f"{first.get('weeks_since_new_best')} weeks."
        )
    if tool == "get_muscle_group_distribution":
        groups = result.get("groups", [])
        if not groups:
            return "Nothing logged in that window."
        top = groups[0]
        return (
            f"You train {top.get('muscle_group_name')} most "
            f"({top.get('volume', {}).get('display', '')})."
        )
    if tool == "get_recent_workouts":
        workouts = result.get("workouts", [])
        if not workouts:
            return "No workouts logged yet."
        first = workouts[0]
        return (
            f"{len(workouts)} recent workouts, latest "
            f"'{first.get('title') or 'Workout'}' on {first.get('performed_on')}."
        )
    if tool == "get_volume":
        volume = result.get("volume", {})
        return f"{result.get('muscle_group_name')} volume is {volume.get('display', '')}."
    return ""


def _format_history(result: dict[str, Any], question: str) -> str:
    sessions = result.get("sessions", [])
    if not sessions:
        return f"You have not logged {result.get('exercise_name')} yet."
    target_g = _target_load_g(question)
    if target_g is not None:
        for session in sessions:
            for lift in session.get("sets", []):
                if lift.get("load_g") == target_g and not lift.get("is_warmup"):
                    return (
                        f"You last lifted that load on {session.get('performed_on')} "
                        f"({lift.get('reps')} reps)."
                    )
        return f"No {result.get('exercise_name')} set found at that load."
    latest = sessions[0]
    heaviest = max(latest.get("sets", []), key=lambda lift: lift.get("load_g", 0))
    return (
        f"You last did {result.get('exercise_name')} on {latest.get('performed_on')}, "
        f"top set {heaviest.get('load', {}).get('display', '')} "
        f"for {heaviest.get('reps')} reps."
    )
