import { apiFetch } from "./client";
import type { components } from "./schema";

export type MuscleGroup = components["schemas"]["MuscleGroupOut"];
export type Exercise = components["schemas"]["ExerciseOut"];
export type ExerciseCreate = components["schemas"]["ExerciseCreate"];
export type LoadType = components["schemas"]["LoadType"];
export type ProgressionMetric = components["schemas"]["ProgressionMetric"];
export type LastSession = components["schemas"]["LastSessionOut"];
export type SessionSummary = components["schemas"]["SessionOut"];
export type SetSummary = components["schemas"]["SetOut"];
export type HistoryPage = components["schemas"]["HistoryPageOut"];
export type ExercisePRs = components["schemas"]["ExercisePRsOut"];

export function listMuscleGroups(): Promise<MuscleGroup[]> {
  return apiFetch<MuscleGroup[]>("/muscle-groups");
}

export interface ListExercisesParams {
  q?: string;
  muscleGroup?: string;
}

export function listExercises(params: ListExercisesParams = {}): Promise<Exercise[]> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.muscleGroup) search.set("muscle_group", params.muscleGroup);
  const qs = search.toString();
  return apiFetch<Exercise[]>(`/exercises${qs ? `?${qs}` : ""}`);
}

export function createExercise(data: ExerciseCreate): Promise<Exercise> {
  return apiFetch<Exercise>("/exercises", { method: "POST", body: data });
}

export function getExercise(exerciseId: string): Promise<Exercise> {
  return apiFetch<Exercise>(`/exercises/${exerciseId}`);
}

export function getLastSession(exerciseId: string): Promise<LastSession> {
  return apiFetch<LastSession>(`/exercises/${exerciseId}/last-session`);
}

export interface GetHistoryParams {
  limit?: number;
  cursor?: string;
}

export function getHistory(
  exerciseId: string,
  params: GetHistoryParams = {}
): Promise<HistoryPage> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiFetch<HistoryPage>(`/exercises/${exerciseId}/history${qs ? `?${qs}` : ""}`);
}

export function getPrs(exerciseId: string): Promise<ExercisePRs> {
  return apiFetch<ExercisePRs>(`/exercises/${exerciseId}/prs`);
}

export interface ExerciseLifetimeStats {
  sessionCount: number;
  totalVolumeGrams: number;
}

const LIFETIME_STATS_MAX_PAGES = 20;

/**
 * No backend aggregate exists for lifetime totals (Task 2.2 only shipped
 * last-session/history/prs), so this walks the cursor-paginated history and sums
 * it client-side. Bounded to avoid an unbounded loop for a pathological history size.
 */
export async function getExerciseLifetimeStats(
  exerciseId: string
): Promise<ExerciseLifetimeStats> {
  let sessionCount = 0;
  let totalVolumeGrams = 0;
  let cursor: string | undefined;

  for (let page = 0; page < LIFETIME_STATS_MAX_PAGES; page++) {
    const result = await getHistory(exerciseId, { limit: 100, cursor });
    sessionCount += result.sessions.length;
    totalVolumeGrams += result.sessions.reduce((sum, s) => sum + s.volume.grams, 0);
    if (!result.next_cursor) break;
    cursor = result.next_cursor;
  }

  return { sessionCount, totalVolumeGrams };
}
