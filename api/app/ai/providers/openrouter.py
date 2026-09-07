from typing import Any

import openai

from app.ai.payloads import ChatMessage, Insight, ProgressAnalysisPayload, Recommendation
from app.ai.service import PROMPT_VERSION, load_system_prompt, utcnow
from app.core.errors import AIUnavailableError

_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
_MAX_TOKENS = 1024
_TIMEOUT_SECONDS = 30.0


class OpenRouterAIService:
    """OpenAI-compatible provider implementation (defaulting to OpenRouter).
    Sends only the precomputed payload; the key comes from settings and never
    reaches the frontend. Any provider failure degrades to a typed 503."""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "",
        client: Any | None = None,
    ) -> None:
        if not api_key:
            raise AIUnavailableError("AI analysis is unavailable right now")
        self._client = client or openai.OpenAI(
            api_key=api_key,
            base_url=base_url or _DEFAULT_BASE_URL,
            timeout=_TIMEOUT_SECONDS,
            default_headers={
                "HTTP-Referer": "https://github.com/liftlog-ai",
                "X-Title": "LiftLog AI",
            },
        )
        self._model = model
        self.model_name = model
        self._system = load_system_prompt("analyze_progress")

    def complete(self, system: str, messages: list[ChatMessage]) -> str:
        return self._create(
            [{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages]
        )

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
        return self._create(
            [
                {"role": "system", "content": self._system},
                {"role": "user", "content": payload_json},
            ]
        )

    def _create(self, messages: list[dict[str, str]]) -> str:
        try:
            completion = self._client.chat.completions.create(
                model=self._model,
                max_tokens=_MAX_TOKENS,
                messages=messages,  # type: ignore[arg-type]
            )
        except openai.AuthenticationError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except (openai.APIConnectionError, openai.APITimeoutError) as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except openai.RateLimitError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        except openai.OpenAIError as exc:
            raise AIUnavailableError("AI analysis is unavailable right now") from exc
        text = (completion.choices[0].message.content or "").strip()
        if not text:
            raise AIUnavailableError("AI analysis is unavailable right now")
        return text
