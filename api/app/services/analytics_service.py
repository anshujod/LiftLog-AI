import uuid
from collections import defaultdict
from datetime import date, timedelta
from typing import Literal

from sqlalchemy.orm import Session

from app.analytics.aggregates import (
    consistency_streak,
    volume_by_muscle_group,
    volume_by_period,
    workout_frequency,
)
from app.analytics.plateau import detect_plateau
from app.analytics.progression import InsufficientDataResult, ProgressionResult, compute_progression
from app.analytics.prs import PRResult, compute_prs
from app.analytics.types import ExerciseSetRecord, SetRecord
from app.analytics.types import LoadType as AnalyticsLoadType
from app.analytics.types import ProgressionMetric as AnalyticsProgressionMetric
from app.analytics.units import Unit, format_load
from app.db.models import Exercise, User
from app.repositories import analytics_repository, exercise_repository
from app.repositories.analytics_repository import UserSetRow
from app.schemas.analytics import (
    DashboardOut,
    MuscleGroupVolumeOut,
    PlateauOut,
    ProgressionOut,
    TopImprovingExerciseOut,
    VolumeByPeriodOut,
    WeeklyVolumeOut,
)
from app.schemas.load import LoadValue
from app.schemas.workout import NewPROut, WorkoutSummaryOut

Period = Literal["30d", "90d", "1y", "all"]

_PERIOD_DAYS: dict[Period, int | None] = {"30d": 30, "90d": 90, "1y": 365, "all": None}

_DASHBOARD_WINDOW_DAYS = 30
_TOP_IMPROVING_WINDOW_DAYS = 90
_TOP_IMPROVING_LIMIT = 3
_RECENT_WORKOUTS_LIMIT = 5


def _period_cutoff(period: Period, today: date) -> date | None:
    days = _PERIOD_DAYS[period]
    return today - timedelta(days=days) if days is not None else None


def _unit(user: User) -> Unit:
    return "kg" if user.unit_preference.value == "kg" else "lb"


def _load_value(load_g: int, unit: Unit) -> LoadValue:
    return LoadValue(grams=load_g, display=format_load(load_g, unit))


def _format_metric_value(value: int, metric: AnalyticsProgressionMetric, unit: Unit) -> str:
    if metric == AnalyticsProgressionMetric.REPS_AT_LOAD:
        return f"{value} rep{'s' if value != 1 else ''}"
    return format_load(value, unit)


def _progression_out(
    result: ProgressionResult | InsufficientDataResult,
    metric: AnalyticsProgressionMetric,
    unit: Unit,
) -> ProgressionOut:
    if isinstance(result, InsufficientDataResult):
        return ProgressionOut(
            metric=metric.value, has_data=False, session_count=result.session_count
        )
    return ProgressionOut(
        metric=metric.value,
        has_data=True,
        session_count=result.session_count,
        starting_value=result.starting_value,
        current_value=result.current_value,
        starting_display=_format_metric_value(result.starting_value, metric, unit),
        current_display=_format_metric_value(result.current_value, metric, unit),
        absolute_change=result.absolute_change,
        percent_change=result.percent_change,
        direction=result.direction,
    )


def _to_set_record(row: UserSetRow) -> SetRecord:
    workout_set, performed_on, workout_id, _exercise, _slug = row
    return SetRecord(
        load_g=workout_set.load_g,
        reps=workout_set.reps,
        is_warmup=workout_set.is_warmup,
        performed_on=performed_on,
        workout_id=workout_id,
    )


def _to_exercise_set_record(row: UserSetRow) -> ExerciseSetRecord:
    workout_set, performed_on, workout_id, exercise, slug = row
    return ExerciseSetRecord(
        load_g=workout_set.load_g,
        reps=workout_set.reps,
        is_warmup=workout_set.is_warmup,
        performed_on=performed_on,
        workout_id=workout_id,
        load_type=AnalyticsLoadType(exercise.load_type.value),
        muscle_group_slug=slug,
    )


def _since(rows: list[UserSetRow], cutoff: date | None) -> list[UserSetRow]:
    if cutoff is None:
        return rows
    return [r for r in rows if r[1] >= cutoff]


def _group_by_exercise(rows: list[UserSetRow]) -> dict[uuid.UUID, list[UserSetRow]]:
    grouped: dict[uuid.UUID, list[UserSetRow]] = defaultdict(list)
    for row in rows:
        grouped[row[3].id].append(row)
    return grouped


def get_exercise_progress(
    db: Session, user: User, exercise: Exercise, period: Period
) -> ProgressionOut:
    rows = exercise_repository.get_all_sets_for_exercise(db, exercise.id, user.id)
    cutoff = _period_cutoff(period, date.today())
    filtered = [r for r in rows if cutoff is None or r[1] >= cutoff]
    set_records = [
        SetRecord(
            load_g=r[0].load_g,
            reps=r[0].reps,
            is_warmup=r[0].is_warmup,
            performed_on=r[1],
            workout_id=r[2],
        )
        for r in filtered
    ]

    metric = AnalyticsProgressionMetric(exercise.progression_metric.value)
    result = compute_progression(
        set_records,
        metric,
        AnalyticsLoadType(exercise.load_type.value),
        user.bodyweight_g,
        exercise.default_increment_g,
    )
    return _progression_out(result, metric, _unit(user))


def get_muscle_group_volume(db: Session, user: User, period: Period) -> list[MuscleGroupVolumeOut]:
    rows = _since(
        analytics_repository.get_all_sets_for_user(db, user.id),
        _period_cutoff(period, date.today()),
    )
    records = [_to_exercise_set_record(r) for r in rows]
    results = volume_by_muscle_group(records, user.bodyweight_g)

    name_by_slug = {g.slug: g.name for g in exercise_repository.list_muscle_groups(db)}
    unit = _unit(user)
    return [
        MuscleGroupVolumeOut(
            muscle_group_slug=r.muscle_group_slug,
            muscle_group_name=name_by_slug.get(r.muscle_group_slug, r.muscle_group_slug),
            volume=_load_value(r.total_volume_g, unit),
            working_set_count=r.working_set_count,
        )
        for r in results
    ]


def get_volume(
    db: Session, user: User, period: Period, granularity: Literal["week", "month"]
) -> list[VolumeByPeriodOut]:
    rows = _since(
        analytics_repository.get_all_sets_for_user(db, user.id),
        _period_cutoff(period, date.today()),
    )
    records = [_to_exercise_set_record(r) for r in rows]
    results = volume_by_period(records, user.bodyweight_g, granularity)
    unit = _unit(user)
    return [
        VolumeByPeriodOut(period_start=r.period_start, volume=_load_value(r.total_volume_g, unit))
        for r in results
    ]


def get_plateaus(db: Session, user: User) -> list[PlateauOut]:
    rows = analytics_repository.get_all_sets_for_user(db, user.id)
    grouped = _group_by_exercise(rows)

    results: list[PlateauOut] = []
    for exercise_rows in grouped.values():
        exercise = exercise_rows[0][3]
        metric = AnalyticsProgressionMetric(exercise.progression_metric.value)
        set_records = [_to_set_record(r) for r in exercise_rows]
        plateau = detect_plateau(
            set_records,
            metric,
            AnalyticsLoadType(exercise.load_type.value),
            user.bodyweight_g,
            exercise.default_increment_g,
        )
        if plateau is None:
            continue
        results.append(
            PlateauOut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                metric=metric.value,
                session_count=plateau.session_count,
                window_start=plateau.window_start,
                window_end=plateau.window_end,
                window_days=plateau.window_days,
                weeks_since_new_best=plateau.weeks_since_new_best,
                improvement_pct=plateau.improvement_pct,
            )
        )

    return results


def get_dashboard(db: Session, user: User) -> DashboardOut:
    today = date.today()
    unit = _unit(user)

    finished_workouts = analytics_repository.get_finished_workouts_for_user(db, user.id)
    recent_workouts = [
        WorkoutSummaryOut(
            id=w.id,
            performed_on=w.performed_on,
            started_at=w.started_at,
            ended_at=w.ended_at,
            title=w.title,
            exercise_count=len(w.workout_exercises),
        )
        for w in finished_workouts[:_RECENT_WORKOUTS_LIMIT]
    ]
    dashboard_cutoff = today - timedelta(days=_DASHBOARD_WINDOW_DAYS)
    recent_workout_dates = [
        w.performed_on for w in finished_workouts if w.performed_on >= dashboard_cutoff
    ]
    workout_count = workout_frequency(recent_workout_dates)
    current_streak_weeks = consistency_streak([w.performed_on for w in finished_workouts], today)

    all_rows = analytics_repository.get_all_sets_for_user(db, user.id)
    grouped = _group_by_exercise(all_rows)

    top_improving = _top_improving_exercises(grouped, today, unit)
    recent_prs = _recent_prs(grouped, dashboard_cutoff, unit)
    weekly_volume = _weekly_volume(all_rows, today, user.bodyweight_g, unit)

    return DashboardOut(
        recent_workouts=recent_workouts,
        top_improving_exercises=top_improving,
        recent_prs=recent_prs,
        weekly_volume=weekly_volume,
        workout_count=workout_count,
        current_streak_weeks=current_streak_weeks,
        period_days=_DASHBOARD_WINDOW_DAYS,
    )


def _top_improving_exercises(
    grouped: dict[uuid.UUID, list[UserSetRow]], today: date, unit: Unit
) -> list[TopImprovingExerciseOut]:
    cutoff = today - timedelta(days=_TOP_IMPROVING_WINDOW_DAYS)
    candidates: list[TopImprovingExerciseOut] = []

    for exercise_rows in grouped.values():
        exercise = exercise_rows[0][3]
        metric = AnalyticsProgressionMetric(exercise.progression_metric.value)
        set_records = [_to_set_record(r) for r in exercise_rows if r[1] >= cutoff]
        result = compute_progression(
            set_records,
            metric,
            AnalyticsLoadType(exercise.load_type.value),
            None,
            exercise.default_increment_g,
        )
        if isinstance(result, ProgressionResult) and result.direction == "improving":
            candidates.append(
                TopImprovingExerciseOut(
                    exercise_id=exercise.id,
                    exercise_name=exercise.name,
                    metric=metric.value,
                    percent_change=result.percent_change,
                )
            )

    candidates.sort(key=lambda c: c.percent_change, reverse=True)
    return candidates[:_TOP_IMPROVING_LIMIT]


def _recent_prs(
    grouped: dict[uuid.UUID, list[UserSetRow]], cutoff: date, unit: Unit
) -> list[NewPROut]:
    found: list[NewPROut] = []

    for exercise_rows in grouped.values():
        exercise = exercise_rows[0][3]
        set_records = [_to_set_record(r) for r in exercise_rows]
        result = compute_prs(
            set_records,
            AnalyticsLoadType(exercise.load_type.value),
            None,
            exercise.default_increment_g,
        )
        found.extend(_recent_prs_for_exercise(result, exercise, cutoff, unit))

    found.sort(key=lambda pr: pr.performed_on, reverse=True)
    return found


def _recent_prs_for_exercise(
    result: PRResult, exercise: Exercise, cutoff: date, unit: Unit
) -> list[NewPROut]:
    found: list[NewPROut] = []

    if result.weight_pr is not None and result.weight_pr.set_record.performed_on >= cutoff:
        sr = result.weight_pr.set_record
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="weight",
                value=_load_value(sr.load_g, unit),
                reps=sr.reps,
                workout_id=sr.workout_id,
                performed_on=sr.performed_on,
            )
        )

    if result.e1rm_pr is not None and result.e1rm_pr.set_record.performed_on >= cutoff:
        sr = result.e1rm_pr.set_record
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="e1rm",
                value=_load_value(result.e1rm_pr.value, unit),
                reps=sr.reps,
                workout_id=sr.workout_id,
                performed_on=sr.performed_on,
            )
        )

    if result.session_volume_pr is not None and result.session_volume_pr.performed_on >= cutoff:
        svp = result.session_volume_pr
        found.append(
            NewPROut(
                exercise_id=exercise.id,
                exercise_name=exercise.name,
                pr_type="session_volume",
                value=_load_value(svp.value, unit),
                reps=None,
                workout_id=svp.workout_id,
                performed_on=svp.performed_on,
            )
        )

    return found


def _weekly_volume(
    rows: list[UserSetRow], today: date, bodyweight_g: int | None, unit: Unit
) -> WeeklyVolumeOut:
    records = [_to_exercise_set_record(r) for r in rows]
    by_week = {
        v.period_start: v.total_volume_g for v in volume_by_period(records, bodyweight_g, "week")
    }

    this_week_start = today - timedelta(days=today.weekday())
    last_week_start = this_week_start - timedelta(days=7)

    current = by_week.get(this_week_start, 0)
    previous = by_week.get(last_week_start, 0)
    percent_change = round((current - previous) / previous * 100, 1) if previous > 0 else None

    return WeeklyVolumeOut(
        current_week=_load_value(current, unit),
        previous_week=_load_value(previous, unit),
        percent_change=percent_change,
    )
