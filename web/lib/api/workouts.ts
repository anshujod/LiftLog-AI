import { apiFetch } from "./client";
import type { components } from "./schema";

export type Workout = components["schemas"]["WorkoutOut"];
export type WorkoutSummary = components["schemas"]["WorkoutSummaryOut"];
export type WorkoutsPage = components["schemas"]["WorkoutsPageOut"];
export type WorkoutExercise = components["schemas"]["WorkoutExerciseOut"];
export type WorkoutSet = components["schemas"]["SetOut"];
export type SetInput = components["schemas"]["SetIn"];
export type SetPatch = components["schemas"]["SetUpdate"];
export type FinishSummary = components["schemas"]["FinishSummaryOut"];
export type NewPR = components["schemas"]["NewPROut"];

export interface CreateWorkoutParams {
  performed_on?: string;
  title?: string;
  notes?: string;
}

export function createWorkout(data: CreateWorkoutParams = {}): Promise<Workout> {
  return apiFetch<Workout>("/workouts", { method: "POST", body: data });
}

export function getWorkout(workoutId: string): Promise<Workout> {
  return apiFetch<Workout>(`/workouts/${workoutId}`);
}

export interface ListWorkoutsParams {
  limit?: number;
  cursor?: string;
}

export function listWorkouts(params: ListWorkoutsParams = {}): Promise<WorkoutsPage> {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const qs = search.toString();
  return apiFetch<WorkoutsPage>(`/workouts${qs ? `?${qs}` : ""}`);
}

export function deleteWorkout(workoutId: string): Promise<void> {
  return apiFetch<void>(`/workouts/${workoutId}`, { method: "DELETE" });
}

export function finishWorkout(workoutId: string): Promise<FinishSummary> {
  return apiFetch<FinishSummary>(`/workouts/${workoutId}/finish`, { method: "POST" });
}

export function addWorkoutExercise(workoutId: string, exerciseId: string): Promise<WorkoutExercise> {
  return apiFetch<WorkoutExercise>(`/workouts/${workoutId}/exercises`, {
    method: "POST",
    body: { exercise_id: exerciseId },
  });
}

export function deleteWorkoutExercise(workoutExerciseId: string): Promise<void> {
  return apiFetch<void>(`/workout-exercises/${workoutExerciseId}`, { method: "DELETE" });
}

export function addSet(workoutExerciseId: string, data: SetInput): Promise<WorkoutSet> {
  return apiFetch<WorkoutSet>(`/workout-exercises/${workoutExerciseId}/sets`, {
    method: "POST",
    body: data,
  });
}

export function updateSet(setId: string, data: SetPatch): Promise<WorkoutSet> {
  return apiFetch<WorkoutSet>(`/sets/${setId}`, { method: "PATCH", body: data });
}

export function deleteSet(setId: string): Promise<void> {
  return apiFetch<void>(`/sets/${setId}`, { method: "DELETE" });
}
