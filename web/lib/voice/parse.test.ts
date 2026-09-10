import { describe, expect, it } from "vitest";
import { parseVoiceCommand, type VoiceLogCommand } from "./parse";
import type { Exercise, LoadType } from "../api/exercises";

function ex(name: string, loadType: LoadType, id: string): Exercise {
  return {
    id,
    muscle_group_id: 1,
    name,
    load_type: loadType,
    progression_metric: "e1rm",
    default_increment_g: 2500,
    is_active: true,
    is_custom: false,
  };
}

const EXERCISES: Exercise[] = [
  ex("Bench Press", "barbell_total", "bench"),
  ex("Overhead Press", "barbell_total", "ohp"),
  ex("Squat", "barbell_total", "squat"),
  ex("Deadlift", "barbell_total", "deadlift"),
  ex("Pull-ups", "bodyweight", "pullups"),
  ex("Dumbbell Curl", "dumbbell_per_hand", "curl"),
  ex("Lateral Raise", "dumbbell_per_hand", "lateral"),
];

function logOf(transcript: string, unit: "kg" | "lb" = "kg"): VoiceLogCommand {
  const result = parseVoiceCommand(transcript, EXERCISES, unit);
  if (result.kind !== "log") throw new Error(`expected log, got ${result.kind}: ${transcript}`);
  return result;
}

describe("parseVoiceCommand", () => {
  it("parses the canonical full command", () => {
    expect(logOf("log bench press 60 kilos 3 sets of 8")).toMatchObject({
      exerciseId: "bench",
      exerciseName: "Bench Press",
      loadG: 60000,
      reps: 8,
      sets: 3,
      isWarmup: false,
      confidence: "high",
    });
  });

  it("handles reps/for/by phrasing with an implicit single set", () => {
    expect(logOf("bench 60 8 reps")).toMatchObject({ exerciseId: "bench", loadG: 60000, reps: 8, sets: 1 });
    expect(logOf("deadlift 140 for 5")).toMatchObject({ exerciseId: "deadlift", loadG: 140000, reps: 5, sets: 1 });
    expect(logOf("squat 100 5 by 5")).toMatchObject({ exerciseId: "squat", loadG: 100000, reps: 5, sets: 5 });
  });

  it("parses number words, decimals, and hundreds", () => {
    expect(logOf("curls twelve point five 3 sets of 12")).toMatchObject({
      exerciseId: "curl",
      loadG: 12500,
      reps: 12,
      sets: 3,
    });
    expect(logOf("squat a hundred kilos 5 reps")).toMatchObject({ loadG: 100000, reps: 5 });
    expect(logOf("deadlift one forty for five")).toMatchObject({ loadG: 140000, reps: 5 });
    expect(logOf("bench sixty two point five kilos 8 reps")).toMatchObject({ loadG: 62500, reps: 8 });
  });

  it("lets a spoken unit override the preference", () => {
    expect(logOf("bench 135 pounds 5 reps", "kg")).toMatchObject({ loadG: 61235, reps: 5 });
    expect(logOf("bench 60 kilos 5 reps", "lb")).toMatchObject({ loadG: 60000, reps: 5 });
  });

  it("resolves aliases and STT-shaped names", () => {
    expect(logOf("flat bench 60 8").exerciseId).toBe("bench");
    expect(logOf("pullups 10 reps")).toMatchObject({ exerciseId: "pullups", loadG: 0, reps: 10 });
  });

  it("reads 'A x B' as load×reps when the numbers say so", () => {
    expect(logOf("bench 60 x 8")).toMatchObject({ loadG: 60000, reps: 8, sets: 1 });
    const lateral = logOf("lateral raise 8 x 15");
    expect(lateral).toMatchObject({ exerciseId: "lateral", loadG: 8000, reps: 15, confidence: "medium" });
  });

  it("flags warmups without touching the numbers", () => {
    expect(logOf("warmup bench press 40 kilos 10 reps")).toMatchObject({
      exerciseId: "bench",
      loadG: 40000,
      reps: 10,
      isWarmup: true,
    });
  });

  it("parses repeat commands", () => {
    for (const utterance of ["same again", "repeat", "repeat last set", "one more", "another one"]) {
      expect(parseVoiceCommand(utterance, EXERCISES, "kg")).toMatchObject({ kind: "repeat" });
    }
  });

  it("returns disambiguation candidates instead of guessing", () => {
    const result = logOf("press 60 8");
    expect(result.exerciseId).toBeNull();
    expect(result.candidates.map((c) => c.id).sort()).toEqual(["bench", "ohp"]);
    expect(result.loadG).toBe(60000);
    expect(result.reps).toBe(8);
    expect(result.confidence).toBe("low");
  });

  it("returns incomplete commands for missing fields", () => {
    expect(logOf("bench press")).toMatchObject({ exerciseId: "bench", loadG: null, reps: null, confidence: "low" });
    expect(logOf("bench 60")).toMatchObject({ loadG: 60000, reps: null, confidence: "low" });
    const noExercise = logOf("sixty kilos eight reps");
    expect(noExercise).toMatchObject({ exerciseId: null, loadG: 60000, reps: 8, confidence: "low" });
  });

  it("returns unmatched when nothing parses", () => {
    for (const utterance of ["", "blah blah nonsense", "uh"]) {
      expect(parseVoiceCommand(utterance, EXERCISES, "kg").kind).toBe("unmatched");
    }
  });

  it("tolerates verbs, fillers, and punctuation", () => {
    expect(logOf("please log bench 60 8.")).toMatchObject({ exerciseId: "bench", loadG: 60000, reps: 8 });
    expect(logOf("uh bench sixty for eight")).toMatchObject({ exerciseId: "bench", loadG: 60000, reps: 8 });
  });
});
