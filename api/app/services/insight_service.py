import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.ai.payloads import (
    DashboardPayload,
    ExerciseProgressPayload,
    Insight,
    LastTopSet,
    ProgressAnalysisPayload,
    Recommendation,
    RecommendationPayload,
    SuggestedSetOut,
    TrainingSummaryPayload,
    UnitName,
    WeekExerciseChange,
)
from app.ai.service import AIService
from app.analytics.loads import set_volume_g
from app.analytics.recommendation import suggest_sets
from app.analytics.types import LoadType as AnalyticsLoadType
from app.analytics.types import ProgressionMetric as AnalyticsProgressionMetric
from app.analytics.types import SetRecord
from app.analytics.units import Unit, format_load
from app.analytics.weekly import percent_change, weekly_best
from app.core.errors import AIUnavailableError, NotFoundError
from app.db.models import Exercise, User
from app.repositories import analytics_repository, exercise_repository, weekly_summary_repository
from app.schemas.ai import (
    AnalyzeProgressOut,
    ExerciseWeekChangeOut,
    SetSuggestionOut,
    WeekSummaryOut,
    WorkoutRecommendationOut,
)
from app.schemas.load import LoadValue
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
    days = _PERIOD_DAYS[period]
    cutoff: date | None = date.today() - timedelta(days=days) if days is not None else None
    workouts = analytics_repository.get_finished_workouts_for_user(db, user.id)
    if cutoff is None:
        return len(workouts)
    return sum(1 for w in workouts if w.performed_on >= cutoff)


def build_recommendation(
    db: Session, user: User, ai: AIService, exercise_id: uuid.UUID
) -> WorkoutRecommendationOut:
    exercise = db.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id not in (None, user.id):
        raise NotFoundError("Exercise not found")
    unit: UnitName = "kg" if user.unit_preference.value == "kg" else "lb"
    load_type = AnalyticsLoadType(exercise.load_type.value)

    rows = exercise_repository.get_last_completed_session_sets(db, exercise.id, user.id)
    working = sorted(
        (row for row in rows if not row[0].is_warmup), key=lambda row: row[0].set_number
    )
    scheme = suggest_sets(
        [(row[0].load_g, row[0].reps) for row in working],
        load_type,
        exercise.default_increment_g,
    )
    top = max(working, key=lambda row: (row[0].load_g, row[0].reps), default=None)
    progression = analytics_service.get_exercise_progress(db, user, exercise, "90d")

    payload = RecommendationPayload(
        unit=unit,
        exercise_id=str(exercise.id),
        exercise_name=exercise.name,
        progression_metric=exercise.progression_metric.value,
        set_count=len(scheme),
        suggested_sets=[
            SuggestedSetOut(
                load_g=lift.load_g,
                reps=lift.reps,
                load_display=format_load(lift.load_g, _analytics_unit(unit)),
            )
            for lift in scheme
        ],
        last_top_set=(
            LastTopSet(
                load_g=top[0].load_g,
                load_display=format_load(top[0].load_g, _analytics_unit(unit)),
                reps=top[0].reps,
            )
            if top is not None
            else None
        ),
        progression_direction=progression.direction if progression.has_data else None,
        progression_percent=progression.percent_change if progression.has_data else None,
    )
    recommendation: Recommendation = ai.recommend_workout(payload)
    return WorkoutRecommendationOut(
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        suggested_sets=[
            SetSuggestionOut(
                load=LoadValue(grams=lift.load_g, display=lift.load_display),
                reps=lift.reps,
            )
            for lift in payload.suggested_sets
        ],
        explanation=recommendation.explanation,
        model=recommendation.model,
    )


def get_weekly_summary(db: Session, user: User, ai: AIService) -> WeekSummaryOut:
    today = date.today()
    iso_year, iso_week, _ = today.isocalendar()
    week_start = date.fromisocalendar(iso_year, iso_week, 1)
    week_end = week_start + timedelta(days=6)

    cached = weekly_summary_repository.get_cached(db, user.id, iso_year, iso_week)
    if cached is not None:
        return WeekSummaryOut(**{**cached, "cached": True})

    unit: UnitName = "kg" if user.unit_preference.value == "kg" else "lb"
    rows = analytics_repository.get_all_sets_for_user(db, user.id)
    grouped: dict[uuid.UUID, list[analytics_repository.UserSetRow]] = defaultdict(list)
    for row in rows:
        grouped[row[3].id].append(row)

    changes: list[ExerciseWeekChangeOut] = []
    week_volume_g = 0
    for exercise_rows in grouped.values():
        exercise = exercise_rows[0][3]
        metric = AnalyticsProgressionMetric(exercise.progression_metric.value)
        load_type = AnalyticsLoadType(exercise.load_type.value)
        current_records = [
            SetRecord(
                load_g=row[0].load_g,
                reps=row[0].reps,
                is_warmup=row[0].is_warmup,
                performed_on=row[1],
                workout_id=row[2],
            )
            for row in exercise_rows
            if week_start <= row[1] <= week_end
        ]
        previous_records = [
            SetRecord(
                load_g=row[0].load_g,
                reps=row[0].reps,
                is_warmup=row[0].is_warmup,
                performed_on=row[1],
                workout_id=row[2],
            )
            for row in exercise_rows
            if week_start - timedelta(days=7) <= row[1] < week_start
        ]
        week_volume_g += sum(
            set_volume_g(record.load_g, record.reps, load_type, user.bodyweight_g)
            for record in current_records
            if not record.is_warmup
        )
        current = weekly_best(
            current_records, metric, load_type, user.bodyweight_g, exercise.default_increment_g
        )
        previous = weekly_best(
            previous_records, metric, load_type, user.bodyweight_g, exercise.default_increment_g
        )
        if current is None or previous is None:
            continue
        changes.append(
            ExerciseWeekChangeOut(
                exercise_name=exercise.name,
                metric=metric.value,
                previous_display=_format_week_value(previous, metric, unit),
                current_display=_format_week_value(current, metric, unit),
                percent_change=percent_change(current, previous),
            )
        )

    finished = analytics_repository.get_finished_workouts_for_user(db, user.id)
    workouts_completed = sum(
        1 for workout in finished if week_start <= workout.performed_on <= week_end
    )
    new_prs = analytics_service.list_prs_since(db, user, week_start)
    pr_lines = [
        f"{pr.exercise_name} {pr.value.display}"
        + (f" × {pr.reps}" if pr.reps is not None else "")
        + f" on {pr.performed_on.isoformat()}"
        for pr in new_prs
    ]
    payload = TrainingSummaryPayload(
        unit=unit,
        week_start=week_start.isoformat(),
        workouts_completed=workouts_completed,
        total_volume_display=format_load(week_volume_g, _analytics_unit(unit)),
        changes=[
            WeekExerciseChange(
                exercise_name=change.exercise_name,
                metric=change.metric,
                previous_display=change.previous_display,
                current_display=change.current_display,
                percent_change=change.percent_change,
            )
            for change in changes
        ],
        new_prs=pr_lines,
    )
    try:
        observation: str | None = ai.summarize_training(payload).summary
        model: str | None = ai.model_name
    except AIUnavailableError:
        observation = None
        model = None

    summary = WeekSummaryOut(
        week_start=week_start,
        week_end=week_end,
        workouts_completed=workouts_completed,
        total_volume=LoadValue(
            grams=week_volume_g, display=format_load(week_volume_g, _analytics_unit(unit))
        ),
        changes=changes,
        new_prs=new_prs,
        observation=observation,
        model=model,
        cached=False,
    )
    if observation is not None:
        weekly_summary_repository.save(
            db, user.id, iso_year, iso_week, summary.model_dump(mode="json")
        )
    return summary


def _analytics_unit(unit: UnitName) -> Unit:
    return "kg" if unit == "kg" else "lb"


def _format_week_value(value: int, metric: AnalyticsProgressionMetric, unit: UnitName) -> str:
    if metric == AnalyticsProgressionMetric.REPS_AT_LOAD:
        return f"{value} rep{'s' if value != 1 else ''}"
    return format_load(value, _analytics_unit(unit))
