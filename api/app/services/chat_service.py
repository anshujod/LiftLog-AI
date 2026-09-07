import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.ai.agent import AgentResult, normalize_history, run_agent
from app.ai.payloads import ChatMessage
from app.ai.service import AIService
from app.ai.tools import TOOL_DEFINITIONS, build_agent_system_prompt
from app.ai.tools.resolve import resolve_exercise
from app.db.models import Exercise, User
from app.repositories import analytics_repository, exercise_repository
from app.schemas.ai import ChatIn, ChatOut, ToolCallTraceOut
from app.schemas.workout import WorkoutSummaryOut
from app.services import analytics_service, exercise_service
from app.services.analytics_service import Period

_PERIOD_DAYS: dict[Period, int | None] = {"30d": 30, "90d": 90, "1y": 365, "all": None}
_HISTORY_LIMIT = 8
_RECENT_LIMIT = 20


def ask(db: Session, user: User, ai: AIService, payload: ChatIn) -> ChatOut:
    unit = "kg" if user.unit_preference.value == "kg" else "lb"
    system = build_agent_system_prompt(unit, date.today().isoformat())
    history = [ChatMessage(role=m.role, content=m.content) for m in payload.history]
    result: AgentResult = run_agent(
        lambda system_prompt, messages: ai.complete(system_prompt, messages),
        lambda name, arguments: run_tool(db, user, name, arguments),
        system,
        payload.message,
        normalize_history(history),
    )
    return ChatOut(
        answer=result.answer,
        model=ai.model_name,
        tool_trace=[
            ToolCallTraceOut(
                round=entry.round,
                name=entry.name,
                arguments=entry.arguments,
                result=entry.result,
            )
            for entry in result.trace
        ],
    )


class _ToolValidationError(Exception):
    """Bad tool arguments. Caught by the executor and returned to the model
    as data — never surfaced as an HTTP error."""


def run_tool(db: Session, user: User, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(arguments, dict):
        return {"error": "validation", "message": "arguments must be an object"}
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"error": "unknown_tool", "message": f"no tool named '{name}'"}
    try:
        return handler(db, user, arguments)
    except _ToolValidationError as exc:
        return {"error": "validation", "message": str(exc)}


def _period(arguments: dict[str, Any], default: Period = "30d") -> Period:
    period = arguments.get("period", default)
    if period == "30d":
        return "30d"
    if period == "90d":
        return "90d"
    if period == "1y":
        return "1y"
    if period == "all":
        return "all"
    raise _ToolValidationError(f"period must be one of {sorted(_PERIOD_DAYS)}")


def _limit(arguments: dict[str, Any], key: str, default: int, maximum: int) -> int:
    value = arguments.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise _ToolValidationError(f"{key} must be an integer")
    if not 1 <= value <= maximum:
        raise _ToolValidationError(f"{key} must be between 1 and {maximum}")
    return value


def _exercise_phrase(arguments: dict[str, Any]) -> str:
    name = arguments.get("exercise_name")
    if not isinstance(name, str) or not name.strip():
        raise _ToolValidationError("exercise_name must be a non-empty string")
    return name.strip()


def _resolve(db: Session, user: User, phrase: str) -> tuple[uuid.UUID | None, list[str]]:
    """Match phrasing to a visible exercise. Returns the id, or None plus
    candidate names when uncertain, or None plus [] when nothing matches."""
    visible = exercise_repository.list_visible_exercises(db, user.id, None, None, True)
    exercise_id, candidates = resolve_exercise(
        [(exercise.id, exercise.name) for exercise in visible], phrase
    )
    return exercise_id, [name for _, name in candidates]


def _load_exercise(db: Session, exercise_id: uuid.UUID) -> Exercise:
    exercise = db.get(Exercise, exercise_id)
    assert exercise is not None
    return exercise


def _tool_exercise_history(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    phrase = _exercise_phrase(arguments)
    limit = _limit(arguments, "limit", 5, _HISTORY_LIMIT)
    exercise_id, candidates = _resolve(db, user, phrase)
    if exercise_id is None:
        return _no_match(phrase, candidates)
    exercise = _load_exercise(db, exercise_id)
    page = exercise_service.get_history(db, user, exercise, limit, None)
    return {
        "exercise_name": exercise.name,
        "sessions": [
            {
                "performed_on": session.performed_on.isoformat(),
                "volume": session.volume.model_dump(),
                "working_set_count": session.working_set_count,
                "sets": [
                    {
                        "load_g": lift.load.grams,
                        "load": lift.load.model_dump(),
                        "reps": lift.reps,
                        "is_warmup": lift.is_warmup,
                    }
                    for lift in session.sets
                ],
            }
            for session in page.sessions
        ],
    }


def _tool_last_workout(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    phrase = _exercise_phrase(arguments)
    exercise_id, candidates = _resolve(db, user, phrase)
    if exercise_id is None:
        return _no_match(phrase, candidates)
    exercise = _load_exercise(db, exercise_id)
    last = exercise_service.get_last_session(db, user, exercise)
    if not last.has_data or last.session is None:
        return {"exercise_name": exercise.name, "has_data": False, "session": None}
    session = last.session
    return {
        "exercise_name": exercise.name,
        "has_data": True,
        "session": {
            "performed_on": session.performed_on.isoformat(),
            "volume": session.volume.model_dump(),
            "working_set_count": session.working_set_count,
        },
    }


def _tool_personal_records(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    phrase = _exercise_phrase(arguments)
    exercise_id, candidates = _resolve(db, user, phrase)
    if exercise_id is None:
        return _no_match(phrase, candidates)
    exercise = _load_exercise(db, exercise_id)
    prs = exercise_service.get_prs(db, user, exercise)
    return {"exercise_name": exercise.name, **prs.model_dump(mode="json")}


def _tool_progress(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    phrase = _exercise_phrase(arguments)
    period = _period(arguments, "90d")
    exercise_id, candidates = _resolve(db, user, phrase)
    if exercise_id is None:
        return _no_match(phrase, candidates)
    exercise = _load_exercise(db, exercise_id)
    progression = analytics_service.get_exercise_progress(db, user, exercise, period)
    return {
        "exercise_name": exercise.name,
        "period": period,
        "progression": progression.model_dump(mode="json"),
    }


def _tool_volume(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    slug = arguments.get("muscle_group")
    if not isinstance(slug, str) or not slug.strip():
        raise _ToolValidationError("muscle_group must be a non-empty string")
    period = _period(arguments, "30d")
    groups = {group.slug: group.name for group in exercise_repository.list_muscle_groups(db)}
    normalized = slug.strip().lower()
    if normalized not in groups:
        return {
            "error": "unknown_muscle_group",
            "muscle_group": slug,
            "valid": sorted(groups),
        }
    volumes = analytics_service.get_muscle_group_volume(db, user, period)
    match = next((volume for volume in volumes if volume.muscle_group_slug == normalized), None)
    return {
        "muscle_group": normalized,
        "muscle_group_name": groups[normalized],
        "period": period,
        "volume": match.volume.model_dump() if match else {"grams": 0, "display": "0.0"},
        "working_set_count": match.working_set_count if match else 0,
    }


def _tool_recent_workouts(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    limit = _limit(arguments, "limit", 5, _RECENT_LIMIT)
    workouts = analytics_repository.get_finished_workouts_for_user(db, user.id)[:limit]
    return {
        "workouts": [
            WorkoutSummaryOut(
                id=workout.id,
                performed_on=workout.performed_on,
                started_at=workout.started_at,
                ended_at=workout.ended_at,
                title=workout.title,
                exercise_count=len(workout.workout_exercises),
            ).model_dump(mode="json")
            for workout in workouts
        ]
    }


def _tool_prs(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    period = _period(arguments, "30d")
    days = _PERIOD_DAYS[period]
    cutoff = date.today() - timedelta(days=days) if days is not None else date.min
    prs = analytics_service.list_prs_since(db, user, cutoff)
    return {
        "period": period,
        "prs": [
            {
                "exercise_name": pr.exercise_name,
                "pr_type": pr.pr_type,
                "value": pr.value.model_dump(),
                "reps": pr.reps,
                "performed_on": pr.performed_on.isoformat(),
            }
            for pr in prs[:20]
        ],
    }


def _tool_plateaus(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    plateaus = analytics_service.get_plateaus(db, user)
    return {
        "plateaus": [
            {
                "exercise_name": plateau.exercise_name,
                "metric": plateau.metric,
                "session_count": plateau.session_count,
                "window_days": plateau.window_days,
                "weeks_since_new_best": plateau.weeks_since_new_best,
                "improvement_pct": plateau.improvement_pct,
            }
            for plateau in plateaus
        ]
    }


def _tool_distribution(db: Session, user: User, arguments: dict[str, Any]) -> dict[str, Any]:
    period = _period(arguments, "30d")
    volumes = analytics_service.get_muscle_group_volume(db, user, period)
    return {
        "period": period,
        "groups": [
            {
                "muscle_group_name": volume.muscle_group_name,
                "volume": volume.volume.model_dump(),
                "working_set_count": volume.working_set_count,
            }
            for volume in volumes
        ],
    }


def _no_match(phrase: str, candidates: list[str]) -> dict[str, Any]:
    if candidates:
        return {
            "error": "ambiguous_exercise",
            "exercise_name": phrase,
            "candidates": [{"exercise_name": name} for name in candidates[:5]],
        }
    return {"error": "unknown_exercise", "exercise_name": phrase}


_HANDLERS = {
    "get_exercise_history": _tool_exercise_history,
    "get_last_workout": _tool_last_workout,
    "get_personal_records": _tool_personal_records,
    "get_progress": _tool_progress,
    "get_volume": _tool_volume,
    "get_recent_workouts": _tool_recent_workouts,
    "get_prs": _tool_prs,
    "detect_plateaus": _tool_plateaus,
    "get_muscle_group_distribution": _tool_distribution,
}

assert set(_HANDLERS) == {tool.name for tool in TOOL_DEFINITIONS}
