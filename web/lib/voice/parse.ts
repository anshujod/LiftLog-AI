/**
 * Deterministic voice-command grammar: transcript → structured sets.
 *
 * Pure function, no I/O, no network — it runs fully offline on the phone.
 * Anything it cannot parse with confidence comes back as an incomplete
 * command (missing fields) or `unmatched`, and the confirm sheet lets the
 * user fix values by hand. The LLM is deliberately not involved: mapping
 * "sixty" → 60 is lookup, not interpretation.
 *
 * Supported utterances (unit defaults to the user's preference, spoken unit wins):
 *   "log bench press 60 kilos 3 sets of 8"
 *   "bench 60 8 reps" / "deadlift 140 for 5" / "squat 100 5 by 5"
 *   "curls twelve point five 3 sets of 12" / "bench 60 x 8"
 *   "warmup bench 40 10" / "same again" / "pullups 10 reps"
 */

import type { Exercise } from "../api/exercises";
import type { Unit } from "../units";
import { unitToG } from "../units";
import { normalizeExerciseText, resolveExerciseVoice, type ResolvableExercise } from "./resolve";
import { spokenToDigits, wordsToNumber } from "./numbers";

export type VoiceConfidence = "high" | "medium" | "low";

export interface VoiceLogCommand {
  kind: "log";
  /** Original transcript, kept as the evidence the parse is grounded in. */
  transcript: string;
  exerciseId: string | null;
  exerciseName: string | null;
  /** Raw exercise phrase when resolution needs the user to pick. */
  exercisePhrase: string;
  candidates: ResolvableExercise[];
  loadG: number | null;
  reps: number | null;
  sets: number;
  isWarmup: boolean;
  confidence: VoiceConfidence;
}

export interface VoiceRepeatCommand {
  kind: "repeat";
  transcript: string;
}

export interface VoiceUnmatchedCommand {
  kind: "unmatched";
  transcript: string;
}

export type VoiceCommand = VoiceLogCommand | VoiceRepeatCommand | VoiceUnmatchedCommand;

const REPEAT_RE =
  /^(same again|repeat( that| last| previous)?( set)?|one more|another( one| set)?|do it again|again)$/;

const LEADING_VERB_RE = /^(log|add|record|track|do|start logging)\b\s*/;
const WARMUP_RE = /\bwarm[\s-]?ups?\b/;
const FILLER_RE = /\b(uh|um|er|ah|please|like)\b/g;
const UNIT_WORDS: Record<string, Unit> = {
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
};
const SETS_OF_RE = /(\d+)\s+sets?\s+of\s+(\d+)/;
const SETS_RE = /(\d+)\s+sets?\b/;
const REPS_RE = /(\d+)\s+reps?\b/;
const FOR_REPS_RE = /\bfor\s+(\d+)\b/;
/** Compact "3x8" / "5 by 5" — see the ambiguity note where it is applied. */
const X_RE = /(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+)/;
const NUMBER_RE = /\d+(?:\.\d+)?/g;

const toInt = (value: number): number => Math.trunc(value);

export function parseVoiceCommand(
  transcript: string,
  exercises: Exercise[],
  defaultUnit: Unit,
): VoiceCommand {
  let text = normalizeExerciseText(transcript).replace(/×/g, "x").replace(/[.?!]+$/g, "");
  if (!text) return { kind: "unmatched", transcript };

  if (REPEAT_RE.test(text)) return { kind: "repeat", transcript };

  // Fillers first: "please log bench…" must reduce to a leading verb.
  text = text.replace(FILLER_RE, " ");
  text = normalizeExerciseText(text).replace(LEADING_VERB_RE, "");

  const isWarmup = WARMUP_RE.test(text);
  text = text.replace(WARMUP_RE, " ");

  // Unit-anchored load: "sixty kilos" / "135 lb". The unit word marks the
  // load boundary, so extract it BEFORE digit conversion merges adjacent
  // quantities ("sixty eight" would otherwise read as 68, not 60 + 8).
  let unit = defaultUnit;
  let loadValue: number | null = null;
  {
    const tokens = normalizeExerciseText(text).split(" ").filter(Boolean);
    const unitIdx = tokens.findIndex((t) => UNIT_WORDS[t] !== undefined);
    if (unitIdx !== -1) {
      unit = UNIT_WORDS[tokens[unitIdx]];
      const before = tokens.slice(Math.max(0, unitIdx - 4), unitIdx);
      let loadLen = 0;
      for (let len = before.length; len >= 1; len--) {
        const candidate = before.slice(before.length - len);
        const value =
          candidate.length === 1 && /^\d+(?:\.\d+)?$/.test(candidate[0])
            ? Number(candidate[0])
            : wordsToNumber(candidate);
        if (value !== null) {
          loadValue = value;
          loadLen = len;
          break;
        }
      }
      tokens.splice(unitIdx - loadLen, loadLen + 1); // load tokens + unit word
      text = tokens.join(" ");
    }
  }

  let working = spokenToDigits(normalizeExerciseText(text));

  let sets: number | null = null;
  let reps: number | null = null;
  let setsExplicit = false;
  let heuristicPair = false;
  const blank = (matched: string) => {
    working = working.replace(matched, " ");
  };

  // "3 sets of 8" is unambiguous — extract before anything else.
  const setsOf = working.match(SETS_OF_RE);
  if (setsOf) {
    sets = toInt(Number(setsOf[1]));
    reps = toInt(Number(setsOf[2]));
    setsExplicit = true;
    blank(setsOf[0]);
  }

  // "AxB" is genuinely ambiguous: "5 x 5" is sets×reps but "60 x 8" and
  // "lateral raise 8 x 15" are load×reps. Heuristic: B > 12 or A > 20 (or a
  // fractional A, which can never be a set count) reads as load×reps and is
  // left in place for the positional pass; the confirm sheet stays the backstop.
  const xMatch = setsExplicit ? null : working.match(X_RE);
  if (xMatch) {
    const a = Number(xMatch[1]);
    const b = Number(xMatch[2]);
    if (Number.isInteger(a) && b <= 12 && a <= 20) {
      sets = a;
      reps = b;
      setsExplicit = true;
      blank(xMatch[0]);
    } else {
      heuristicPair = true;
    }
  }

  if (!setsExplicit) {
    const setsOnly = working.match(SETS_RE);
    if (setsOnly) {
      sets = toInt(Number(setsOnly[1]));
      setsExplicit = true;
      blank(setsOnly[0]);
    }
  }

  if (reps === null) {
    const repsOnly = working.match(REPS_RE);
    if (repsOnly) {
      reps = toInt(Number(repsOnly[1]));
      blank(repsOnly[0]);
    }
  }

  if (reps === null) {
    const forReps = working.match(FOR_REPS_RE);
    if (forReps) {
      reps = toInt(Number(forReps[1]));
      blank(forReps[0]);
    }
  }

  // Whatever numbers remain are positional: load first (unless the unit
  // anchor already set it), then reps/sets.
  const rest = working.match(NUMBER_RE)?.map(Number) ?? [];
  if (loadValue === null && rest.length > 0) {
    loadValue = rest.shift() as number;
  }
  if (reps === null) {
    if (setsExplicit) {
      reps = rest.length > 0 ? toInt(rest[rest.length - 1]) : null;
    } else if (rest.length === 1) {
      reps = toInt(rest[0]);
    } else if (rest.length >= 2) {
      sets = toInt(rest[0]);
      reps = toInt(rest[1]);
    }
  }

  // The exercise is whatever precedes the first remaining number ("bench 60 8"
  // → "bench"). Post-number names ("60 kilos bench 8") are out of scope for v1.
  const firstDigit = working.search(/\d/);
  const exercisePhrase = normalizeExerciseText(
    firstDigit === -1 ? working : working.slice(0, firstDigit),
  );
  const resolution = exercisePhrase
    ? resolveExerciseVoice(exercises, exercisePhrase)
    : { kind: "none" as const };

  const exerciseId = resolution.kind === "match" ? resolution.id : null;
  const candidates = resolution.kind === "candidates" ? resolution.candidates : [];
  const exercise = exerciseId ? (exercises.find((e) => e.id === exerciseId) ?? null) : null;

  let loadG: number | null = loadValue === null ? null : unitToG(loadValue, unit);
  if (loadG === null && exercise && (exercise.load_type === "bodyweight" || exercise.load_type === "bodyweight_added")) {
    // "pullups ten reps" — no load spoken because there is none to speak.
    loadG = 0;
  }

  if (exerciseId === null && loadG === null && reps === null) {
    return { kind: "unmatched", transcript };
  }

  // A spoken load on a strict-bodyweight exercise contradicts its load_type;
  // the server would 422 it, so flag low confidence instead of failing.
  const bodyweightContradiction =
    exercise?.load_type === "bodyweight" && loadValue !== null && loadValue !== 0;

  const confidence: VoiceConfidence =
    exerciseId === null || loadG === null || reps === null || bodyweightContradiction
      ? "low"
      : heuristicPair
        ? "medium"
        : "high";

  return {
    kind: "log",
    transcript,
    exerciseId,
    exerciseName: exercise?.name ?? null,
    exercisePhrase,
    candidates,
    loadG,
    reps,
    sets: sets ?? 1,
    isWarmup,
    confidence,
  };
}
