import re
import uuid

_WS_RE = re.compile(r"\s+")

# Common gym phrasing mapped to the global exercise it means. Checked before
# any fuzzy matching so documented phrasing resolves deterministically.
ALIASES = {
    "flat bench": "bench press",
}

_CANDIDATE_LIMIT = 5


def normalize(text: str) -> str:
    return _WS_RE.sub(" ", text.strip().lower())


def resolve_exercise(
    visible: list[tuple[uuid.UUID, str]], phrase: str
) -> tuple[uuid.UUID | None, list[tuple[uuid.UUID, str]]]:
    """Match user phrasing to an exercise id using only application code.

    Returns (exercise_id, []) on a confident match, (None, candidates) when
    the phrasing is uncertain, or (None, []) when nothing matches. The model
    never guesses at ids: uncertain matches come back as a disambiguation
    list for it to ask about.
    """
    query = normalize(ALIASES.get(normalize(phrase), phrase))
    if not query:
        return None, []
    names = [(exercise_id, name, normalize(name)) for exercise_id, name in visible]

    exact = [item for item in names if item[2] == query]
    if len(exact) == 1:
        return exact[0][0], []

    starts = [item for item in names if item[2].startswith(query)]
    if len(starts) == 1:
        return starts[0][0], []
    if starts:
        return None, _candidates(starts)

    containing = [item for item in names if query in item[2]]
    if len(containing) == 1:
        return containing[0][0], []
    if containing:
        return None, _candidates(containing)

    query_tokens = set(query.split())
    scored = sorted(
        (
            (
                len(query_tokens & set(normalized.split())),
                -len(normalized),
                normalized,
                (exercise_id, name, normalized),
            )
            for exercise_id, name, normalized in names
        ),
        key=lambda scored_item: (-scored_item[0], scored_item[1], scored_item[2]),
    )
    scored = [item for item in scored if item[0] > 0]
    if not scored:
        return None, []
    if len(scored) == 1 or scored[0][0] > scored[1][0]:
        return scored[0][3][0], []
    return None, _candidates([item[3] for item in scored])


def _candidates(
    items: list[tuple[uuid.UUID, str, str]],
) -> list[tuple[uuid.UUID, str]]:
    ordered = sorted(items, key=lambda item: (len(item[2]), item[2]))
    return [(exercise_id, name) for exercise_id, name, _ in ordered[:_CANDIDATE_LIMIT]]
