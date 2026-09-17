import type { Dashboard } from "@/lib/api/analytics";

export type RecentPR = Dashboard["recent_prs"][number];

export const MAX_RECENT_PR_ROWS = 5;

/**
 * Collapse the dashboard's flat PR list to one headline row per exercise:
 * the heaviest lifted set (`weight` PR, falling back to `e1rm`). Session
 * totals (`session_volume`) and rep records are real PRs but not sets, so
 * they never headline the Home card — full detail lives on the exercise page.
 */
export function collapseRecentPrs(prs: RecentPR[], limit: number = MAX_RECENT_PR_ROWS): RecentPR[] {
  const bestByExercise = new Map<string, RecentPR>();
  const latestByExercise = new Map<string, string>();
  for (const pr of prs) {
    if (pr.performed_on > (latestByExercise.get(pr.exercise_id) ?? "")) {
      latestByExercise.set(pr.exercise_id, pr.performed_on);
    }
    if (pr.pr_type !== "weight" && pr.pr_type !== "e1rm") continue;
    const current = bestByExercise.get(pr.exercise_id);
    if (!current) {
      bestByExercise.set(pr.exercise_id, pr);
    } else if (current.pr_type === "e1rm" && pr.pr_type === "weight") {
      bestByExercise.set(pr.exercise_id, pr);
    } else if (current.pr_type === pr.pr_type && pr.value.grams > current.value.grams) {
      bestByExercise.set(pr.exercise_id, pr);
    }
  }
  return Array.from(bestByExercise.values())
    .sort((a, b) =>
      (latestByExercise.get(b.exercise_id) ?? "").localeCompare(
        latestByExercise.get(a.exercise_id) ?? ""
      )
    )
    .slice(0, limit);
}
