import { apiFetch } from "./client";
import type { components } from "./schema";
import type { Period } from "./analytics";

export type ProgressAnalysis = components["schemas"]["AnalyzeProgressOut"];
export type ProgressInsight = components["schemas"]["Insight"];

export function analyzeProgress(period: Period = "90d", exerciseId?: string): Promise<ProgressAnalysis> {
  return apiFetch<ProgressAnalysis>("/ai/analyze-progress", {
    method: "POST",
    body: { period, exercise_id: exerciseId ?? null },
  });
}
