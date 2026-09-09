"""Structured logging of LLM token usage, one line per provider call.

Cost visibility: every AI endpoint funnels through a provider's `_create`,
which reports model + input/output tokens here. Aggregating these lines
shows spend per operation and per model without a separate metering system.
"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger("liftlog.ai")
logger.setLevel(logging.INFO)


def log_llm_usage(
    provider: str,
    model: str,
    operation: str,
    input_tokens: int | None,
    output_tokens: int | None,
) -> None:
    logger.info(
        json.dumps(
            {
                "event": "llm_usage",
                "provider": provider,
                "model": model,
                "operation": operation,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }
        )
    )
