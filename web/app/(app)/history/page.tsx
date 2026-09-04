"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listWorkouts, type WorkoutSummary } from "@/lib/api/workouts";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";
import { ApiError } from "@/lib/api/errors";

export default function HistoryPage() {
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkouts({ limit: 20 })
      .then((page) => {
        if (cancelled) return;
        setWorkouts(page.workouts);
        setNextCursor(page.next_cursor);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load history");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listWorkouts({ limit: 20, cursor: nextCursor });
      setWorkouts((prev) => [...(prev ?? []), ...page.workouts]);
      setNextCursor(page.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">History</h1>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!error && workouts === null && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {!error && workouts !== null && workouts.length === 0 && (
        <p className="text-sm text-muted">No workouts logged yet.</p>
      )}

      {!error && workouts !== null && workouts.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {workouts.map((workout) => (
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
                <span className="flex items-center gap-2 text-sm text-muted">
                  {workout.ended_at === null && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">In progress</span>
                  )}
                  {workout.exercise_count} exercises
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="h-11 rounded-lg border border-border text-sm text-muted disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
