import { apiFetch } from "./client";
import type { components } from "./schema";

export type Me = components["schemas"]["UserOut"];

export function getMe(): Promise<Me> {
  return apiFetch<Me>("/me");
}

export function updateBodyweight(bodyweightG: number): Promise<Me> {
  return apiFetch<Me>("/me", { method: "PATCH", body: { bodyweight_g: bodyweightG } });
}

export function updateUnitPreference(unitPreference: "kg" | "lb"): Promise<Me> {
  return apiFetch<Me>("/me", { method: "PATCH", body: { unit_preference: unitPreference } });
}
