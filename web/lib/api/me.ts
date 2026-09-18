import { apiFetch, clearApiCache } from "./client";
import type { components } from "./schema";

export type Me = components["schemas"]["UserOut"];

export function getMe(): Promise<Me> {
  return getMeCached();
}

const ME_TTL_MS = 60_000;

let meCache: { value: Me; expiresAt: number } | null = null;
let meInflight: Promise<Me> | null = null;

/** Shared /me with TTL + in-flight dedupe. All header/unit/profile callers
 *  share one request per minute instead of 2-3 parallel GET /me on cold start. */
export function getMeCached(): Promise<Me> {
  const now = Date.now();
  if (meCache && meCache.expiresAt > now) return Promise.resolve(meCache.value);
  if (!meInflight) {
    meInflight = apiFetch<Me>("/me")
      .then((me) => {
        meCache = { value: me, expiresAt: Date.now() + ME_TTL_MS };
        return me;
      })
      .finally(() => {
        meInflight = null;
      });
  }
  return meInflight;
}

/** Call after login/logout/unit change so the next read is fresh. */
export function resetMeCache(): void {
  meCache = null;
  meInflight = null;
  clearApiCache();
}

export function updateBodyweight(bodyweightG: number): Promise<Me> {
  return apiFetch<Me>("/me", { method: "PATCH", body: { bodyweight_g: bodyweightG } });
}

export function updateUnitPreference(unitPreference: "kg" | "lb"): Promise<Me> {
  return apiFetch<Me>("/me", { method: "PATCH", body: { unit_preference: unitPreference } });
}
