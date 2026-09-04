"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listWorkouts } from "@/lib/api/workouts";

/** The id of the caller's in-progress (unfinished) workout, if any. */
export function useActiveWorkoutId(): string | null {
  const { status } = useAuth();
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
  }, [status]);

  return activeWorkoutId;
}
