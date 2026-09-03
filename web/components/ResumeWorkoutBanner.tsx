"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";

interface WorkoutSummary {
  id: string;
  ended_at: string | null;
}

interface WorkoutsPage {
  workouts: WorkoutSummary[];
}

/** Shows a tap-to-resume banner when the caller has a workout that was started but
 * never finished. Task 3.3 builds the active-workout page this links to. */
export function ResumeWorkoutBanner() {
  const { status } = useAuth();
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    apiFetch<WorkoutsPage>("/workouts?limit=5")
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

  if (!activeWorkoutId) return null;

  return (
    <Link
      href={`/workout?resume=${activeWorkoutId}`}
      className="flex h-11 shrink-0 items-center justify-center bg-accent px-4 text-center text-sm font-medium text-white"
    >
      Workout in progress — tap to resume
    </Link>
  );
}
