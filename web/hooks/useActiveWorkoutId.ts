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
 */
export function useActiveWorkoutId(): string | null {
  const { status } = useAuth();
  const pathname = usePathname();
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    listWorkouts({ limit: 5 })
      .then((page) => {
        if (cancelled) return;
        setActiveWorkoutId(page.workouts.find((w) => w.ended_at === null)?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setActiveWorkoutId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [status, pathname]);

  return activeWorkoutId;
}
