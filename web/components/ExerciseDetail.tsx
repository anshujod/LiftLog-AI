"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getExercise,
  getExerciseLifetimeStats,
  getHistory,
  getPrs,
  type Exercise,
  type ExercisePRs,
  type ExerciseLifetimeStats,
  type SessionSummary,
} from "@/lib/api/exercises";
import { LastSessionPanel } from "@/components/LastSessionPanel";
import { ExerciseCharts } from "@/components/ExerciseCharts";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";
import { formatLoad, getUnitPreference, type Unit } from "@/lib/units";
import { ApiError } from "@/lib/api/errors";

interface ExerciseDetailProps {
  exerciseId: string;
}

export function ExerciseDetail({ exerciseId }: ExerciseDetailProps) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [prs, setPrs] = useState<ExercisePRs | null>(null);
  const [stats, setStats] = useState<ExerciseLifetimeStats | null>(null);
  const [unit, setUnit] = useState<Unit>("kg");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getExercise(exerciseId), getPrs(exerciseId), getUnitPreference()])
      .then(([exerciseData, prsData, unitPref]) => {
        if (cancelled) return;
        setExercise(exerciseData);
        setPrs(prsData);
        setUnit(unitPref);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load exercise");
      });

    getHistory(exerciseId, { limit: 20 })
      .then((page) => {
        if (cancelled) return;
        setSessions(page.sessions);
        setNextCursor(page.next_cursor);
      })
      .catch(() => {});

    getExerciseLifetimeStats(exerciseId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await getHistory(exerciseId, { limit: 20, cursor: nextCursor });
      setSessions((prev) => [...prev, ...page.sessions]);
      setNextCursor(page.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleExpanded(workoutId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href="/exercises" className="text-sm text-muted">
        ← Exercises
      </Link>

      <h1 className="text-2xl font-semibold">{exercise?.name ?? "…"}</h1>

      <LastSessionPanel exerciseId={exerciseId} />

      {exercise && <ExerciseCharts exercise={exercise} />}

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-4 text-center">
        <div>
          <div className="tabular-nums text-xl font-semibold">
            {stats ? stats.sessionCount : "—"}
          </div>
          <div className="text-xs text-muted">Sessions</div>
        </div>
        <div>
          <div className="tabular-nums text-xl font-semibold">
            {stats ? formatLoad(stats.totalVolumeGrams, unit) : "—"}
          </div>
          <div className="text-xs text-muted">Lifetime volume</div>
        </div>
        <div>
          <div className="tabular-nums text-xl font-semibold">
            {prs?.weight_pr ? prs.weight_pr.load.display : "—"}
          </div>
          <div className="text-xs text-muted">Best weight</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">History</h2>
        {sessions.length === 0 && <p className="text-sm text-muted">No sessions yet.</p>}
        {sessions.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {sessions.map((session) => {
              const isOpen = expanded.has(session.workout_id);
              return (
                <li key={session.workout_id}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(session.workout_id)}
                    aria-expanded={isOpen}
                    className="flex min-h-12 w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span>
                      <span className="block">{formatRelativeDate(session.performed_on)}</span>
                      <span className="block text-xs text-muted">
                        {formatAbsoluteDate(session.performed_on)}
                      </span>
                    </span>
                    <span className="tabular-nums text-sm text-muted">{session.volume.display}</span>
                  </button>
                  {isOpen && (
                    <ul className="flex flex-col gap-1 px-4 pb-3">
                      {session.sets.map((set) => (
                        <li key={set.id} className="tabular-nums text-sm text-muted">
                          {set.is_warmup && (
                            <span className="mr-1 text-xs font-medium uppercase">Warmup</span>
                          )}
                          {set.load.display} × {set.reps}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {nextCursor && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="h-11 rounded-lg border border-border text-sm text-muted disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
