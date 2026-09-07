from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from app.ai.payloads import Insight, ProgressAnalysisPayload, Recommendation
from app.core.config import get_settings
from app.core.errors import AIUnavailableError

PROMPT_VERSION = "v1"

_PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_system_prompt(name: str, version: str = PROMPT_VERSION) -> str:
    return (_PROMPTS_DIR / f"{name}.{version}.system.txt").read_text().strip()


class AIService(Protocol):
    """Interpretation boundary. Implementations receive only precomputed
    payloads — never a session, repository, or raw row — so they cannot
    query the database or invent a number that is not in front of them."""

    def analyze_progress(self, payload: ProgressAnalysisPayload) -> Insight: ...
    def answer_workout_question(
        self, question: str, payload: ProgressAnalysisPayload
    ) -> Insight: ...
    def recommend_workout(self, payload: ProgressAnalysisPayload) -> Recommendation: ...
    def summarize_training(self, payload: ProgressAnalysisPayload) -> Insight: ...


class UnavailableAIService:
    """Fallback when no provider key is configured. Every call degrades to a
    typed 503 so screens render their deterministic content with an
    'analysis unavailable' note instead of breaking."""

    def _unavailable(self) -> AIUnavailableError:
        return AIUnavailableError("AI analysis is unavailable right now")

    def analyze_progress(self, payload: ProgressAnalysisPayload) -> Insight:
        raise self._unavailable()

    def answer_workout_question(self, question: str, payload: ProgressAnalysisPayload) -> Insight:
        raise self._unavailable()

    def recommend_workout(self, payload: ProgressAnalysisPayload) -> Recommendation:
        raise self._unavailable()

    def summarize_training(self, payload: ProgressAnalysisPayload) -> Insight:
        raise self._unavailable()


def utcnow() -> datetime:
    return datetime.now(UTC)


def get_ai_service() -> AIService:
    settings = get_settings()
    if not settings.ai_api_key:
        return UnavailableAIService()
    from app.ai.providers.anthropic import AnthropicAIService

    return AnthropicAIService(
        api_key=settings.ai_api_key, model=settings.ai_model, base_url=settings.ai_base_url
    )
