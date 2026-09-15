import type { MuscleGroupVolume } from "@/lib/api/analytics";

export type MuscleSlug =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "abs";

export type IntensityLevel = 0 | 1 | 2 | 3;

export const ALL_MUSCLE_SLUGS: MuscleSlug[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "biceps",
  "triceps",
  "abs",
];

/** Which body view shows each group. Legs/shoulders appear in both. */
export const FRONT_MUSCLES: MuscleSlug[] = ["chest", "shoulders", "biceps", "abs", "legs"];
export const BACK_MUSCLES: MuscleSlug[] = ["back", "shoulders", "triceps", "legs"];

const FALLBACK_NAMES: Record<MuscleSlug, string> = {
  chest: "Chest",
  back: "Back",
  legs: "Legs",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  abs: "Abs",
};

export function displayName(slug: string, groups: MuscleGroupVolume[]): string {
  const found = groups.find((g) => g.muscle_group_slug === slug);
  if (found) return found.muscle_group_name;
  return FALLBACK_NAMES[slug as MuscleSlug] ?? slug;
}

/**
 * Bucket working-set counts into 4 intensity levels relative to the week's
 * max, so the map reads as a heatmap rather than binary on/off.
 * 0 = untrained, 1 = light (<=33% of max), 2 = moderate (<=66%), 3 = high.
 */
export function computeIntensityMap(
  groups: MuscleGroupVolume[]
): Record<string, IntensityLevel> {
  const bySlug = new Map(groups.map((g) => [g.muscle_group_slug, g.working_set_count]));
  const max = Math.max(0, ...groups.map((g) => g.working_set_count));
  const out: Record<string, IntensityLevel> = {};
  for (const slug of ALL_MUSCLE_SLUGS) {
    const count = bySlug.get(slug) ?? 0;
    if (count <= 0 || max <= 0) {
      out[slug] = 0;
    } else if (count / max <= 1 / 3) {
      out[slug] = 1;
    } else if (count / max <= 2 / 3) {
      out[slug] = 2;
    } else {
      out[slug] = 3;
    }
  }
  return out;
}

export function trainedCount(intensity: Record<string, IntensityLevel>): number {
  return ALL_MUSCLE_SLUGS.filter((s) => (intensity[s] ?? 0) > 0).length;
}

/** "2026-09-10" -> "2d ago" / "today" / "6d ago". Null-safe. */
export function relativeDayLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  const trained = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(trained.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((now.getTime() - trained.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}
