import { apiFetch } from "./client";
import type { components } from "./schema";
import type { Workout } from "./workouts";

export type WorkoutTemplate = components["schemas"]["TemplateOut"];
export type WorkoutTemplateSummary = components["schemas"]["TemplateSummaryOut"];
export type TemplateExerciseInput = components["schemas"]["TemplateExerciseIn"];

export function listTemplates(): Promise<WorkoutTemplateSummary[]> {
  return apiFetch<WorkoutTemplateSummary[]>("/templates");
}

export function getTemplate(templateId: string): Promise<WorkoutTemplate> {
  return apiFetch<WorkoutTemplate>(`/templates/${templateId}`);
}

export function createTemplate(data: {
  name: string;
  notes?: string;
  exercises: TemplateExerciseInput[];
}): Promise<WorkoutTemplate> {
  return apiFetch<WorkoutTemplate>("/templates", { method: "POST", body: data });
}

export function deleteTemplate(templateId: string): Promise<void> {
  return apiFetch<void>(`/templates/${templateId}`, { method: "DELETE" });
}

export function saveWorkoutAsTemplate(
  workoutId: string,
  data: { name: string; notes?: string }
): Promise<WorkoutTemplate> {
  return apiFetch<WorkoutTemplate>(`/templates/from-workout/${workoutId}`, {
    method: "POST",
    body: data,
  });
}

export function startWorkoutFromTemplate(templateId: string): Promise<Workout> {
  return apiFetch<Workout>(`/workouts/from-template/${templateId}`, { method: "POST" });
}
