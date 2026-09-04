import { apiFetch } from "./client";
import type { components } from "./schema";

export type Period = "30d" | "90d" | "1y" | "all";
export type Granularity = "week" | "month";

export type Dashboard = components["schemas"]["DashboardOut"];
export type Progression = components["schemas"]["ProgressionOut"];
export type MuscleGroupVolume = components["schemas"]["MuscleGroupVolumeOut"];
export type VolumeByPeriod = components["schemas"]["VolumeByPeriodOut"];
export type Plateau = components["schemas"]["PlateauOut"];
export type TopImprovingExercise = components["schemas"]["TopImprovingExerciseOut"];

export function getDashboard(): Promise<Dashboard> {
  return apiFetch<Dashboard>("/analytics/dashboard");
}

export function getExerciseProgress(exerciseId: string, period: Period = "90d"): Promise<Progression> {
  return apiFetch<Progression>(`/exercises/${exerciseId}/progress?period=${period}`);
}

export function getMuscleGroupVolume(period: Period = "30d"): Promise<MuscleGroupVolume[]> {
  return apiFetch<MuscleGroupVolume[]>(`/analytics/muscle-groups?period=${period}`);
}

export function getVolume(
  period: Period = "30d",
  granularity: Granularity = "week"
): Promise<VolumeByPeriod[]> {
  return apiFetch<VolumeByPeriod[]>(`/analytics/volume?period=${period}&granularity=${granularity}`);
}

export function getPlateaus(): Promise<Plateau[]> {
  return apiFetch<Plateau[]>("/analytics/plateaus");
}
