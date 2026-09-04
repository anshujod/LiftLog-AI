import { apiFetch } from "./api/client";

export type Unit = "kg" | "lb";

const G_PER_KG = 1000;
const G_PER_LB = 453.59237;

export function gToKg(grams: number): number {
  return Math.round((grams / G_PER_KG) * 10) / 10;
}

export function gToLb(grams: number): number {
  return Math.round((grams / G_PER_LB) * 10) / 10;
}

export function kgToG(kg: number): number {
  return Math.round(kg * G_PER_KG);
}

export function lbToG(lb: number): number {
  return Math.round(lb * G_PER_LB);
}

/** Inverse of gToKg/gToLb — converts a value typed in the user's display unit to
 * storage grams. The client sends grams; it never stores a unit-converted value. */
export function unitToG(value: number, unit: Unit): number {
  return unit === "kg" ? kgToG(value) : lbToG(value);
}

/** The numeric part of formatLoad, for a controlled input's default/derived value
 * rather than a submission — same one-decimal rounding as the display string. */
export function gToUnitValue(grams: number, unit: Unit): number {
  return unit === "kg" ? gToKg(grams) : gToLb(grams);
}

/** Client-side mirror of the backend's display formatting (api/app/analytics/units.py).
 * Most API responses already carry a pre-formatted `display` string — prefer that.
 * This exists for values the client formats itself before a round trip (e.g. live input preview). */
export function formatLoad(grams: number, unit: Unit): string {
  const value = unit === "kg" ? gToKg(grams) : gToLb(grams);
  return `${value.toFixed(1)} ${unit}`;
}

interface MeResponse {
  unit_preference: Unit;
}

let cachedUnitPreference: Promise<Unit> | null = null;

/** Fetches and caches the caller's unit preference from GET /me. */
export function getUnitPreference(): Promise<Unit> {
  cachedUnitPreference ??= apiFetch<MeResponse>("/me").then((me) => me.unit_preference);
  return cachedUnitPreference;
}

/** Call after login/logout or a unit-preference change so the next read is fresh. */
export function resetUnitPreferenceCache(): void {
  cachedUnitPreference = null;
}
