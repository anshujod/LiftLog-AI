/**
 * Deterministic exercise-name resolution for voice (and anywhere else the
 * client must map free text to an exercise id without a round trip).
 *
 * Two entry points share one match core:
 *
 * - `resolveExercise` mirrors `api/app/ai/tools/resolve.py` exactly — same
 *   alias table, same precedence (exact → prefix → substring → token
 *   overlap), same 5-candidate cap. The mirrored cases in `resolve.test.ts`
 *   are the sync contract. If the two implementations diverge, prefer a
 *   single server-side `GET /exercises/resolve?phrase=` endpoint over
 *   patching both.
 * - `resolveExerciseVoice` is the STT-tolerant variant used by the voice
 *   parser. Speech recognition drops hyphens ("pull ups" for "Pull-ups") and
 *   pluralizes ("curls" for "Dumbbell Curl"), so it normalizes harder
 *   (alphanumeric-only + singularized) on both the phrase and the library.
 *   This intentionally diverges from the Python normalizer — voice input is
 *   messier than typed chat.
 */

const WS_RE = /\s+/g;

// Gym phrasing mapped to the global exercise it means. Checked before any
// fuzzy matching so documented phrasing resolves deterministically.
export const EXERCISE_ALIASES: Record<string, string> = {
  "flat bench": "bench press",
};

const CANDIDATE_LIMIT = 5;

export interface ResolvableExercise {
  id: string;
  name: string;
}

export type ExerciseResolution =
  | { kind: "match"; id: string }
  | { kind: "candidates"; candidates: ResolvableExercise[] }
  | { kind: "none" };

interface NormEntry {
  id: string;
  name: string;
  normalized: string;
}

export function normalizeExerciseText(text: string): string {
  return text.trim().toLowerCase().replace(WS_RE, " ");
}

/** Aggressive STT-tolerant normalization: "Pull-ups" → "pullup", matching
 * what speech recognition actually emits ("pullups", "pull ups"). */
export function normalizeVoiceText(text: string): string {
  const compact = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact.endsWith("s") && compact.length > 1 ? compact.slice(0, -1) : compact;
}

function candidatesOf(items: NormEntry[]): ResolvableExercise[] {
  return [...items]
    .sort((a, b) => a.normalized.length - b.normalized.length || (a.normalized < b.normalized ? -1 : 1))
    .slice(0, CANDIDATE_LIMIT)
    .map(({ id, name }) => ({ id, name }));
}

/** Shared precedence: exact → prefix → substring → token overlap. The model
 * (and the voice parser) never guess at ids: uncertain matches come back as
 * a disambiguation list for the UI to ask about. */
function resolveAgainst(entries: NormEntry[], query: string): ExerciseResolution {
  if (!query) return { kind: "none" };

  const exact = entries.filter((e) => e.normalized === query);
  if (exact.length === 1) return { kind: "match", id: exact[0].id };

  const starts = entries.filter((e) => e.normalized.startsWith(query));
  if (starts.length === 1) return { kind: "match", id: starts[0].id };
  if (starts.length > 0) return { kind: "candidates", candidates: candidatesOf(starts) };

  const containing = entries.filter((e) => e.normalized.includes(query));
  if (containing.length === 1) return { kind: "match", id: containing[0].id };
  if (containing.length > 0) return { kind: "candidates", candidates: candidatesOf(containing) };

  const queryTokens = new Set(query.split(" "));
  const scored = entries
    .map((e) => {
      const overlap = e.normalized.split(" ").filter((t) => queryTokens.has(t)).length;
      return { overlap, entry: e };
    })
    .filter((s) => s.overlap > 0)
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        a.entry.normalized.length - b.entry.normalized.length ||
        (a.entry.normalized < b.entry.normalized ? -1 : 1),
    );
  if (scored.length === 0) return { kind: "none" };
  if (scored.length === 1 || scored[0].overlap > scored[1].overlap) {
    return { kind: "match", id: scored[0].entry.id };
  }
  return { kind: "candidates", candidates: candidatesOf(scored.map((s) => s.entry)) };
}

export function resolveExercise(
  visible: ResolvableExercise[],
  phrase: string,
): ExerciseResolution {
  const query = normalizeExerciseText(EXERCISE_ALIASES[normalizeExerciseText(phrase)] ?? phrase);
  const entries = visible.map((e) => ({ ...e, normalized: normalizeExerciseText(e.name) }));
  return resolveAgainst(entries, query);
}

export function resolveExerciseVoice(
  visible: ResolvableExercise[],
  phrase: string,
): ExerciseResolution {
  const rawQuery = normalizeExerciseText(phrase);
  const aliased = EXERCISE_ALIASES[rawQuery] ?? rawQuery;
  const query = normalizeVoiceText(aliased);
  const entries = visible.map((e) => ({ ...e, normalized: normalizeVoiceText(e.name) }));
  return resolveAgainst(entries, query);
}
