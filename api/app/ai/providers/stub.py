from app.ai.payloads import Insight, ProgressAnalysisPayload, Recommendation
from app.ai.service import PROMPT_VERSION, utcnow
from app.core.errors import AIUnavailableError

_STUB_MODEL = "stub"


class StubAIService:
    """Deterministic stand-in for tests. Builds its summary purely by
    formatting numbers already present in the payload, so grounding checks
    can run without network access or a provider key."""

    def __init__(self, model: str = _STUB_MODEL) -> None:
        self._model = model

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
