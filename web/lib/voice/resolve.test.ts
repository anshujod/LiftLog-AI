import { describe, expect, it } from "vitest";
import {
  normalizeVoiceText,
  resolveExercise,
  resolveExerciseVoice,
  type ResolvableExercise,
} from "./resolve";

const LIBRARY: ResolvableExercise[] = [
  { id: "bench", name: "Bench Press" },
  { id: "incline-bench", name: "Incline Bench Press" },
  { id: "ohp", name: "Overhead Press" },
  { id: "squat", name: "Squat" },
  { id: "pullups", name: "Pull-ups" },
];

describe("resolveExercise (Python mirror)", () => {
  it("matches exact names and documented aliases", () => {
    expect(resolveExercise(LIBRARY, "Squat")).toEqual({ kind: "match", id: "squat" });
    expect(resolveExercise(LIBRARY, "flat bench")).toEqual({ kind: "match", id: "bench" });
  });

  it("matches an unambiguous prefix, else lists candidates", () => {
    expect(resolveExercise(LIBRARY, "overhead")).toEqual({ kind: "match", id: "ohp" });
    expect(resolveExercise(LIBRARY, "bench")).toEqual({ kind: "match", id: "bench" });
    const ambiguous = resolveExercise(LIBRARY, "press");
    expect(ambiguous.kind).toBe("candidates");
    if (ambiguous.kind === "candidates") {
      expect(ambiguous.candidates.map((c) => c.id).sort()).toEqual([
        "bench",
        "incline-bench",
        "ohp",
      ]);
    }
  });

  it("falls back to substring then token overlap", () => {
    expect(resolveExercise(LIBRARY, "head press")).toEqual({ kind: "match", id: "ohp" });
    expect(resolveExercise(LIBRARY, "incline flat")).toEqual({ kind: "match", id: "incline-bench" });
  });

  it("returns none for empty or unmatched phrasing", () => {
    expect(resolveExercise(LIBRARY, "")).toEqual({ kind: "none" });
    expect(resolveExercise(LIBRARY, "kettlebell swing")).toEqual({ kind: "none" });
  });

  it("caps disambiguation lists at five", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, name: `Test Press ${i}` }));
    const result = resolveExercise(many, "press");
    expect(result.kind).toBe("candidates");
    if (result.kind === "candidates") expect(result.candidates).toHaveLength(5);
  });
});

describe("resolveExerciseVoice (STT-tolerant)", () => {
  it("ignores hyphens and plurals the way speech recognition emits them", () => {
    expect(normalizeVoiceText("Pull-ups")).toBe("pullup");
    expect(resolveExerciseVoice(LIBRARY, "pullups")).toEqual({ kind: "match", id: "pullups" });
    expect(resolveExerciseVoice(LIBRARY, "pull ups")).toEqual({ kind: "match", id: "pullups" });
    expect(resolveExerciseVoice(LIBRARY, "squats")).toEqual({ kind: "match", id: "squat" });
  });

  it("keeps the shared precedence and aliases", () => {
    expect(resolveExerciseVoice(LIBRARY, "flat bench")).toEqual({ kind: "match", id: "bench" });
    const ambiguous = resolveExerciseVoice(LIBRARY, "press");
    expect(ambiguous.kind).toBe("candidates");
  });
});
