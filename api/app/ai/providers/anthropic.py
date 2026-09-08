import anthropic
from anthropic.types import Message

from app.ai.payloads import (
    ChatMessage,
    Insight,
    ProgressAnalysisPayload,
    Recommendation,
    RecommendationPayload,
    TrainingSummaryPayload,
)
from app.ai.service import PROMPT_VERSION, load_system_prompt, utcnow
from app.core.errors import AIUnavailableError

_MAX_TOKENS = 1024
_TIMEOUT_SECONDS = 30.0


def _text_of(message: Message) -> str:
    return "".join(block.text for block in message.content if block.type == "text").strip()


class AnthropicAIService:
    """Vendor implementation of the interpretation boundary. Sends only the
    precomputed payload; the key comes from settings and never reaches the
    frontend. `base_url` allows pointing at an Anthropic-compatible gateway
    (for example OpenCode Zen); empty means the official API. Any provider
    failure degrades to a typed 503."""

    def __init__(self, api_key: str, model: str, base_url: str = "") -> None:
        if not api_key:
            raise AIUnavailableError("AI analysis is unavailable right now")
        self._client = anthropic.Anthropic(
            api_key=api_key, base_url=base_url or None, timeout=_TIMEOUT_SECONDS
        )
        self._model = model
        self.model_name = model
        self._system = load_system_prompt("analyze_progress")

    def complete(self, system: str, messages: list[ChatMessage]) -> str:
        return self._create(system, [{"role": m.role, "content": m.content} for m in messages])

    def analyze_progress(self, payload: ProgressAnalysisPayload) -> Insight:
        text = self._complete(payload.model_dump_json(indent=2))
        return Insight(
            summary=text, model=self._model, prompt_version=PROMPT_VERSION, generated_at=utcnow()
        )

    def answer_workout_question(self, question: str, payload: ProgressAnalysisPayload) -> Insight:
        raise AIUnavailableError("AI analysis is unavailable right now")

    def recommend_workout(self, payload: RecommendationPayload) -> Recommendation:
        text = self._create(
            load_system_prompt("recommend"),
            [{"role": "user", "content": payload.model_dump_json(indent=2)}],
        )
        return Recommendation(
            headline=text.split("\n")[0][:160], explanation=text, model=self._model
        )

    def summarize_training(self, payload: TrainingSummaryPayload) -> Insight:
        text = self._create(
            load_system_prompt("weekly_observation"),
            [{"role": "user", "content": payload.model_dump_json(indent=2)}],
        )
        return Insight(
            summary=text, model=self._model, prompt_version=PROMPT_VERSION, generated_at=utcnow()
        )

    def _create(self, system: str, messages: list[dict[str, str]]) -> str:
        try:
            message = self._client.messages.create(
                model=self._model,
                max_tokens=_MAX_TOKENS,
                system=system,
                messages=messages,  # type: ignore[arg-type]
            )
        except anthropic.AuthenticationError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except anthropic.RateLimitError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except anthropic.AnthropicError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        text = _text_of(message)
        if not text:
            raise AIUnavailableError("AI analysis is unavailable right now")
        return text

    def _complete(self, payload_json: str) -> str:
        return self._create(self._system, [{"role": "user", "content": payload_json}])
