"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listWorkouts } from "@/lib/api/workouts";

/**
 * The id of the caller's in-progress (unfinished) workout, if any.
 *
 * This is also mounted persistently in the app layout (for the resume banner),
 * so it re-checks on every navigation rather than only once on mount — otherwise
 * finishing a workout on /workout/[id] and navigating elsewhere would leave the
 * banner showing a workout that's already done.
 *
 * Performance: this hook is mounted in several persistent components at once
 * (layout banner, sidebar, bottom nav, header, dashboard). To avoid firing one
 * `listWorkouts` per instance on every navigation, all instances share a single
 * module-level cache entry with a short TTL plus in-flight de-duplication.
 * Mutations update/invalidate the cache synchronously (see
 * `setActiveWorkoutCache` / `invalidateActiveWorkoutId`), so the TTL never
 * serves a stale id after a start or finish — it only absorbs redundant
 * read bursts during navigation.
 */

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 15_000;

let cache: CacheEntry | null = null;
let inflight: Promise<string | null> | null = null;

function readCache(now: number): { hit: boolean; value: string | null } {
  if (cache && cache.expiresAt > now) return { hit: true, value: cache.value };
  return { hit: false, value: null };
}

function fetchActiveId(): Promise<string | null> {
  if (!inflight) {
    inflight = listWorkouts({ limit: 5 })
      .then((page) => {
        const id = page.workouts.find((w) => w.ended_at === null)?.id ?? null;
        cache = { value: id, expiresAt: Date.now() + CACHE_TTL_MS };
        return id;
      })
      .catch(() => {
        // Same degradation as before: treat lookup failure as "no active workout".
        // Failures are not cached, so the next navigation retries.
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Record a freshly started workout so all mounted instances update without refetching. */
export function setActiveWorkoutCache(id: string): void {
  cache = { value: id, expiresAt: Date.now() + CACHE_TTL_MS };
}

/** Drop the cached id (e.g. after finishing) so the next read refetches. */
export function invalidateActiveWorkoutId(): void {
  cache = null;
}

export function useActiveWorkoutId(): string | null {
  const { status } = useAuth();
  const pathname = usePathname();
  // Seed from the shared cache so a fresh read needs no network at all.
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(() => {
    if (status !== "authenticated") return null;
    const { hit, value } = readCache(Date.now());
    return hit ? value : null;
  });

  useEffect(() => {
    if (status !== "authenticated") {
      // Account switch without a reload must never reuse the previous
      // account's id, even within the TTL.
      cache = null;
      return;
    }
    // Fast path: another mounted instance already resolved this recently.
    // (No setState here — the initializer above already seeded from cache,
    // and async resolutions below commit via callbacks.)
    if (readCache(Date.now()).hit) return;
    let cancelled = false;

    fetchActiveId().then((id) => {
      if (!cancelled) setActiveWorkoutId(id);
    });

    return () => {
      cancelled = true;
    };
  }, [status, pathname]);

  return activeWorkoutId;
}
