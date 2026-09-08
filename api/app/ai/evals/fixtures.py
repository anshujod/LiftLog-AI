"""Recorded fixtures for the honesty evals: fixed payloads with known numbers,
so the suite is deterministic and cheap. Live-provider runs reuse the same
fixtures."""

import uuid
from datetime import UTC, datetime

from app.ai.payloads import (
    DashboardPayload,
    ExerciseProgressPayload,
    ProgressAnalysisPayload,
    RecommendationPayload,
    SuggestedSetOut,
    TrainingSummaryPayload,
    WeekExerciseChange,
)
from app.analytics.progression import Direction
from app.schemas.analytics import (
    PlateauOut,
    ProgressionOut,
    TopImprovingExerciseOut,
    WeeklyVolumeOut,
)
from app.schemas.load import LoadValue
from app.schemas.pr import ExercisePRsOut
from app.schemas.workout import NewPROut

GENERATED_AT = datetime(2026, 9, 7, 12, 0, tzinfo=UTC)


def _grams(value: int) -> LoadValue:
    return LoadValue(grams=value, display=f"{value / 1000:.1f} kg")


def progression_fixture(direction: Direction, percent: float) -> ProgressionOut:
    return ProgressionOut(
        metric="e1rm",
        has_data=True,
        session_count=6,
        starting_value=100000,
        current_value=112000,
        starting_display="100.0 kg",
        current_display="112.0 kg",
        absolute_change=12000,
        percent_change=percent,
        direction=direction,
    )


def dashboard_fixture(direction: Direction | None, percent: float = 12.0) -> DashboardPayload:
    top = (
        [
            TopImprovingExerciseOut(
                exercise_id=uuid.uuid4(),
                exercise_name="Bench Press",
                metric="e1rm",
                percent_change=percent,
            )
        ]
        if direction == "improving"
        else []
    )
    return DashboardPayload(
        period_days=30,
        workout_count=12,
        current_streak_weeks=4,
        weekly_volume=WeeklyVolumeOut(
            current_week=_grams(600000),
            previous_week=_grams(500000),
            percent_change=20.0,
        ),
        top_improving_exercises=top,
        recent_prs=[
            NewPROut(
                exercise_id=uuid.uuid4(),
                exercise_name="Bench Press",
                pr_type="weight",
                value=_grams(112000),
                reps=5,
                workout_id=uuid.uuid4(),
                performed_on="2026-09-05",
            )
        ],
    )


def progress_payload_fixture(direction: Direction | None) -> ProgressAnalysisPayload:
    return ProgressAnalysisPayload(
        unit="kg",
        period="90d",
        has_sufficient_data=True,
        session_count=6,
        focus_exercise=None,
        dashboard=dashboard_fixture(direction),
        plateaus=[],
    )


def thin_payload_fixture() -> ProgressAnalysisPayload:
    return ProgressAnalysisPayload(
        unit="kg",
        period="90d",
        has_sufficient_data=False,
        session_count=2,
        focus_exercise=None,
        dashboard=dashboard_fixture(None),
        plateaus=[],
    )


def plateau_payload_fixture() -> ProgressAnalysisPayload:
    payload = progress_payload_fixture(None)
    payload.plateaus.append(
        PlateauOut(
            exercise_id=uuid.uuid4(),
            exercise_name="Overhead Press",
            metric="e1rm",
            session_count=7,
            window_start="2026-07-20",
            window_end="2026-09-01",
            window_days=43,
            weeks_since_new_best=6,
            improvement_pct=1.2,
        )
    )
    return payload


def recommendation_fixture() -> RecommendationPayload:
    return RecommendationPayload(
        unit="kg",
        exercise_id=str(uuid.uuid4()),
        exercise_name="Bench Press",
        progression_metric="e1rm",
        set_count=3,
        suggested_sets=[
            SuggestedSetOut(load_g=102500, reps=5, load_display="102.5 kg"),
            SuggestedSetOut(load_g=102500, reps=5, load_display="102.5 kg"),
            SuggestedSetOut(load_g=102500, reps=5, load_display="102.5 kg"),
        ],
        last_top_set=None,
        progression_direction="improving",
        progression_percent=12.0,
    )


def empty_recommendation_fixture() -> RecommendationPayload:
    fixture = recommendation_fixture()
    fixture.suggested_sets = []
    fixture.set_count = 0
    return fixture


def week_payload_fixture() -> TrainingSummaryPayload:
    return TrainingSummaryPayload(
        unit="kg",
        week_start="2026-08-31",
        workouts_completed=4,
        total_volume_display="2450.0 kg",
        changes=[
            WeekExerciseChange(
                exercise_name="Squat",
                metric="e1rm",
                previous_display="140.0 kg",
                current_display="145.0 kg",
                percent_change=3.6,
            )
        ],
        new_prs=["Squat 145.0 kg × 5 on 2026-09-05"],
    )


def quiet_week_fixture() -> TrainingSummaryPayload:
    return TrainingSummaryPayload(
        unit="kg",
        week_start="2026-08-31",
        workouts_completed=0,
        total_volume_display="0.0 kg",
        changes=[],
        new_prs=[],
    )


def exercise_progress_fixture() -> ExerciseProgressPayload:
    return ExerciseProgressPayload(
        exercise_id=str(uuid.uuid4()),
        exercise_name="Bench Press",
        progression_metric="e1rm",
        progression=progression_fixture("improving", 12.0),
        bests=ExercisePRsOut(weight_pr=None, rep_pr=None, e1rm_pr=None, session_volume_pr=None),
        recent_sessions=[],
    )
