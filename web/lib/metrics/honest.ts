/** Honest presentation of volume comparisons. Never fabricate a delta. */

export type VolumeDelta =
  | { kind: "empty-week"; label: string }
  | { kind: "first-week"; label: string }
  | { kind: "delta"; percent: number; up: boolean; label: string };

export function describeVolumeDelta(
  currentGrams: number,
  previousGrams: number,
  percentChange: number | null
): VolumeDelta {
  if (currentGrams <= 0) {
    return { kind: "empty-week", label: "No training this week" };
  }
  if (previousGrams <= 0 || percentChange === null) {
    return { kind: "first-week", label: "First training this week" };
  }
  const up = percentChange >= 0;
  const sign = up ? "+" : "";
  return {
    kind: "delta",
    percent: percentChange,
    up,
    label: `${sign}${percentChange}% vs last week`,
  };
}

/** Hide meaningless zero loads in tiles and detail headers. */
export function formatLoadOrDash(display: string, grams: number): string {
  if (grams <= 0) return "—";
  return display;
}
