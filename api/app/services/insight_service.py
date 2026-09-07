import uuid
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.ai.payloads import (
    DashboardPayload,
    ExerciseProgressPayload,
    Insight,
    ProgressAnalysisPayload,
    UnitName,
)
from app.ai.service import AIService
from app.core.errors import NotFoundError
from app.db.models import Exercise, User
from app.schemas.ai import AnalyzeProgressOut
from app.services import analytics_service, exercise_service
from app.services.analytics_service import Period

_PERIOD_DAYS: dict[Period, int | None] = {"30d": 30, "90d": 90, "1y": 365, "all": None}

_RECENT_SESSION_LIMIT = 5


def build_progress_payload(
    db: Session, user: User, period: Period, exercise_id: uuid.UUID | None
) -> ProgressAnalysisPayload:
    unit: UnitName = "kg" if user.unit_preference.value == "kg" else "lb"

    dashboard_out = analytics_service.get_dashboard(db, user)
    plateaus = analytics_service.get_plateaus(db, user)

    focus: ExerciseProgressPayload | None = None
    if exercise_id is not None:
        focus = _focus_exercise(db, user, period, exercise_id)

    session_count = _finished_session_count(db, user, period)

    return ProgressAnalysisPayload(
        unit=unit,
        period=period,
        has_sufficient_data=session_count >= 3,
        session_count=session_count,
        focus_exercise=focus,
        dashboard=DashboardPayload(
            period_days=dashboard_out.period_days,
            workout_count=dashboard_out.workout_count,
            current_streak_weeks=dashboard_out.current_streak_weeks,
            weekly_volume=dashboard_out.weekly_volume,
            top_improving_exercises=dashboard_out.top_improving_exercises,
            recent_prs=dashboard_out.recent_prs[:10],
        ),
        plateaus=plateaus,
    )


def analyze_progress(
    db: Session, user: User, ai: AIService, period: Period, exercise_id: uuid.UUID | None
) -> AnalyzeProgressOut:
    payload = build_progress_payload(db, user, period, exercise_id)
    insight: Insight = ai.analyze_progress(payload)
    return AnalyzeProgressOut(insight=insight, payload=payload)


def _focus_exercise(
    db: Session, user: User, period: Period, exercise_id: uuid.UUID
) -> ExerciseProgressPayload:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id not in (None, user.id):
        raise NotFoundError("Exercise not found")

    progression = analytics_service.get_exercise_progress(db, user, exercise, period)
    bests = exercise_service.get_prs(db, user, exercise)
    history = exercise_service.get_history(db, user, exercise, _RECENT_SESSION_LIMIT, None)

    return ExerciseProgressPayload(
        exercise_id=str(exercise.id),
        exercise_name=exercise.name,
        progression_metric=exercise.progression_metric.value,
        progression=progression,
        bests=bests,
        recent_sessions=history.sessions,
    )


def _finished_session_count(db: Session, user: User, period: Period) -> int:
    from app.repositories import analytics_repository

    days = _PERIOD_DAYS[period]
    cutoff: date | None = date.today() - timedelta(days=days) if days is not None else None
    workouts = analytics_repository.get_finished_workouts_for_user(db, user.id)
    if cutoff is None:
        return len(workouts)
    return sum(1 for w in workouts if w.performed_on >= cutoff)
