import json
import re
from pathlib import Path

_NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")

_HEDGED_WORDS = ("may", "appears", "appear", "consider", "suggest", "might", "could")

_BANNED_PHRASES = (
    "guarantee",
    "definitely will",
    "you must",
    "diagnos",
    "injury",
    "injuries",
    "you should",
)

_CATALOG_PATH = Path(__file__).resolve().parent.parent.parent.parent / "seeds" / "exercises.json"


def catalog_exercise_names() -> list[str]:
    data = json.loads(_CATALOG_PATH.read_text())
    return [exercise["name"] for exercise in data["exercises"]]


def _normalize_number(token: str) -> float | None:
    try:
        return float(token.replace(",", ""))
    except ValueError:
        return None


def extract_numbers(text: str) -> list[str]:
    return _NUMBER_RE.findall(text)


def assert_grounded(output: str, payload_json: str, rel_tol: float = 0.01) -> None:
    """Every numeric token in the output must appear in the payload, either
    verbatim or within `rel_tol` (covers display rounding like 93.33 → 93.3).
    Raises AssertionError listing offenders — a failing test, not a judgment."""
    raw_numbers = [_normalize_number(token) for token in extract_numbers(payload_json)]
    known_numbers: list[float] = [value for value in raw_numbers if value is not None]
    offenders: list[str] = []
    for token in extract_numbers(output):
        if token in payload_json or token.replace(",", "") in payload_json:
            continue
        value = _normalize_number(token)
        if value is None:
            continue
        if any(abs(value - known) <= rel_tol * max(abs(known), 1e-9) for known in known_numbers):
            continue
        offenders.append(token)
    if offenders:
        raise AssertionError(f"ungrounded numbers in output: {offenders}\noutput: {output}")


def assert_no_foreign_exercises(
    output: str, allowed_names: list[str], catalog: list[str] | None = None
) -> None:
    """The output must not mention an exercise absent from the payload."""
    lowered = output.lower()
    allowed = {name.lower() for name in allowed_names}
    offenders = [
        name
        for name in (catalog or catalog_exercise_names())
        if name.lower() in lowered and name.lower() not in allowed
    ]
    if offenders:
        raise AssertionError(f"output mentions exercises absent from payload: {offenders}")


def assert_hedged(output: str) -> None:
    lowered = output.lower()
    if not any(word in lowered for word in _HEDGED_WORDS):
        raise AssertionError("output contains no hedged language")
    banned = [phrase for phrase in _BANNED_PHRASES if phrase in lowered]
    if banned:
        raise AssertionError(f"output contains banned phrasing: {banned}")


def assert_declines(output: str) -> None:
    if "not enough" not in output.lower():
        raise AssertionError("output does not decline despite insufficient data")
