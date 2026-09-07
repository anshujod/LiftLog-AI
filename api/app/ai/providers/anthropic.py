import anthropic
from anthropic.types import Message

from app.ai.payloads import ChatMessage, Insight, ProgressAnalysisPayload, Recommendation
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
        try:
            message = self._client.messages.create(
                model=self._model,
                max_tokens=_MAX_TOKENS,
                system=system,
                messages=[{"role": m.role, "content": m.content} for m in messages],
            )
        except anthropic.AuthenticationError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except (anthropic.APIConnectionError, anthropic.APITimeoutError) as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except anthropic.RateLimitError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except anthropic.AnthropicError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        return _text_of(message)

    def analyze_progress(self, payload: ProgressAnalysisPayload) -> Insight:
        text = self._complete(payload.model_dump_json(indent=2))
        return Insight(
            summary=text, model=self._model, prompt_version=PROMPT_VERSION, generated_at=utcnow()
        )

    def answer_workout_question(self, question: str, payload: ProgressAnalysisPayload) -> Insight:
        raise AIUnavailableError("AI analysis is unavailable right now")

    def recommend_workout(self, payload: ProgressAnalysisPayload) -> Recommendation:
        raise AIUnavailableError("AI analysis is unavailable right now")

    def summarize_training(self, payload: ProgressAnalysisPayload) -> Insight:
        raise AIUnavailableError("AI analysis is unavailable right now")

    def _complete(self, payload_json: str) -> str:
        try:
            message = self._client.messages.create(
                model=self._model,
                max_tokens=_MAX_TOKENS,
                system=self._system,
                messages=[{"role": "user", "content": payload_json}],
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
