import { describe, expect, it } from "vitest";
import { collapseRecentPrs, MAX_RECENT_PR_ROWS, type RecentPR } from "./prs";

function pr(
  exerciseId: string,
  name: string,
  prType: RecentPR["pr_type"],
  grams: number,
  display: string,
  performedOn: string,
  reps: number | null = 8
): RecentPR {
  return {
    exercise_id: exerciseId,
    exercise_name: name,
    pr_type: prType,
    value: { grams, display },
    reps,
    workout_id: "workout-1",
    performed_on: performedOn,
  } as RecentPR;
}

describe("collapseRecentPrs", () => {
  it("returns one row per exercise preferring the weight PR", () => {
    const input = [
      pr("a", "Tricep Pushdown", "weight", 50000, "50.0 kg", "2026-09-10"),
      pr("a", "Tricep Pushdown", "e1rm", 63300, "63.3 kg", "2026-09-10"),
      pr("a", "Tricep Pushdown", "session_volume", 760000, "760.0 kg", "2026-09-10", null),
    ];
    const out = collapseRecentPrs(input);
    expect(out).toHaveLength(1);
    expect(out[0].pr_type).toBe("weight");
    expect(out[0].value.display).toBe("50.0 kg");
  });

  it("falls back to e1rm and never headlines session volume", () => {
    const input = [
      pr("b", "Lateral Raise", "session_volume", 500000, "500.0 kg", "2026-09-11", null),
      pr("b", "Lateral Raise", "e1rm", 13300, "13.3 kg", "2026-09-11", 10),
    ];
    const out = collapseRecentPrs(input);
    expect(out).toHaveLength(1);
    expect(out[0].pr_type).toBe("e1rm");
  });

  it("drops exercises with only session-volume PRs", () => {
    const input = [pr("c", "Pec Deck", "session_volume", 970000, "970.0 kg", "2026-09-12", null)];
    expect(collapseRecentPrs(input)).toHaveLength(0);
  });

  it("orders by most recent exercise and caps rows", () => {
    const input: RecentPR[] = Array.from({ length: MAX_RECENT_PR_ROWS + 2 }, (_, i) =>
      pr(`ex-${i}`, `Exercise ${i}`, "weight", 40000 + i, `${40 + i}.0 kg`, `2026-09-${String(i + 1).padStart(2, "0")}`)
    );
    const out = collapseRecentPrs(input);
    expect(out).toHaveLength(MAX_RECENT_PR_ROWS);
    expect(out[0].exercise_id).toBe(`ex-${MAX_RECENT_PR_ROWS + 1}`);
  });

  it("returns empty for empty input", () => {
    expect(collapseRecentPrs([])).toEqual([]);
  });
});
