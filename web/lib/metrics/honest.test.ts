import { describe, expect, it } from "vitest";
import { describeVolumeDelta, formatLoadOrDash } from "./honest";

describe("describeVolumeDelta", () => {
  it("reports an empty week when current is zero", () => {
    expect(describeVolumeDelta(0, 0, null)).toMatchObject({ kind: "empty-week" });
    expect(describeVolumeDelta(0, 5000, -100).label).toMatch(/no training/i);
  });

  it("reports first week when previous is zero", () => {
    const r = describeVolumeDelta(5000, 0, null);
    expect(r.kind).toBe("first-week");
  });

  it("reports signed deltas only when both weeks have data", () => {
    const up = describeVolumeDelta(11000, 10000, 10);
    expect(up.kind).toBe("delta");
    if (up.kind === "delta") {
      expect(up.up).toBe(true);
      expect(up.label).toContain("+10%");
    }
    const down = describeVolumeDelta(9000, 10000, -10);
    if (down.kind === "delta") {
      expect(down.up).toBe(false);
      expect(down.label).toContain("-10%");
    }
  });
});

describe("formatLoadOrDash", () => {
  it("hides zero loads", () => {
    expect(formatLoadOrDash("0.0 kg", 0)).toBe("—");
    expect(formatLoadOrDash("80 kg", 80000)).toBe("80 kg");
  });
});
