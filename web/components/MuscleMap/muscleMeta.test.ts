import { describe, expect, it } from "vitest";
import { computeIntensityMap, relativeDayLabel, trainedCount } from "./muscleMeta";
import type { MuscleGroupVolume } from "@/lib/api/analytics";

function group(slug: string, sets: number): MuscleGroupVolume {
  return {
    muscle_group_slug: slug,
    muscle_group_name: slug,
    volume: { grams: sets * 100_000, display: `${sets * 100} kg` },
    working_set_count: sets,
    last_trained_on: "2026-09-10",
  } as MuscleGroupVolume;
}

describe("computeIntensityMap", () => {
  it("marks everything untrained on empty input", () => {
    const m = computeIntensityMap([]);
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
    expect(trainedCount(m)).toBe(0);
  });

  it("buckets counts relative to the max", () => {
    const m = computeIntensityMap([group("chest", 12), group("back", 6), group("legs", 2)]);
    expect(m.chest).toBe(3);
    expect(m.back).toBe(2);
    expect(m.legs).toBe(1);
    expect(m.abs).toBe(0);
    expect(trainedCount(m)).toBe(3);
  });

  it("gives a lone trained group full intensity", () => {
    const m = computeIntensityMap([group("abs", 4)]);
    expect(m.abs).toBe(3);
  });
});

describe("relativeDayLabel", () => {
  it("handles null and garbage", () => {
    expect(relativeDayLabel(null)).toBeNull();
    expect(relativeDayLabel(undefined)).toBeNull();
    expect(relativeDayLabel("not-a-date")).toBeNull();
  });

  it("labels today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(relativeDayLabel(today)).toBe("today");
  });
});
