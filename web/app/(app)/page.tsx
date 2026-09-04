"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";
import { listWorkouts, type WorkoutSummary } from "@/lib/api/workouts";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";

export default function HomePage() {
  const { logout } = useAuth();
  const activeWorkoutId = useActiveWorkoutId();
  const [recent, setRecent] = useState<WorkoutSummary[] | null>(null);

  useEffect(() => {
    listWorkouts({ limit: 3 })
      .then((page) => setRecent(page.workouts))
      .catch(() => setRecent([]));
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">LiftLog AI</h1>

      {activeWorkoutId ? (
        <Link
          href={`/workout?resume=${activeWorkoutId}`}
          className="flex h-16 items-center justify-center rounded-lg bg-accent text-lg font-medium text-white"
        >
          Resume workout
        </Link>
      ) : (
        <Link
          href="/workout"
          className="flex h-16 items-center justify-center rounded-lg bg-accent text-lg font-medium text-white"
        >
          Start workout
        </Link>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Recent workouts</h2>
        {recent === null && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        )}
        {recent !== null && recent.length === 0 && (
          <p className="text-sm text-muted">Nothing logged yet — start your first workout above.</p>
        )}
        {recent !== null && recent.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {recent.map((workout) => (
              <li key={workout.id}>
                <Link
                  href={`/workout/${workout.id}`}
                  className="flex min-h-12 items-center justify-between px-4 py-3"
                >
                  <span>
                    <span className="block">{workout.title ?? "Workout"}</span>
                    <span className="block text-xs text-muted">
                      {formatRelativeDate(workout.performed_on)} · {formatAbsoluteDate(workout.performed_on)}
                    </span>
                  </span>
                  <span className="text-sm text-muted">{workout.exercise_count} exercises</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="h-12 w-fit rounded-lg border border-border px-6 text-sm font-medium text-foreground"
      >
        Log out
      </button>
    </div>
  );
}
