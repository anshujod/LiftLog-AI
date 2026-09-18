"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getExercise,
  getExerciseLifetimeStats,
  getHistory,
  getPrs,
  listMuscleGroups,
  type Exercise,
  type ExercisePRs,
  type ExerciseLifetimeStats,
  type SessionSummary,
} from "@/lib/api/exercises";
import { LastSessionPanel } from "@/components/LastSessionPanel";
import { ExerciseCharts } from "@/components/ExerciseCharts";
import { MovementArt } from "@/components/exercises/MovementArt";
import { LOAD_TYPE_LABELS } from "@/lib/loadTypes";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";
import { formatLoad, getUnitPreference, type Unit } from "@/lib/units";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { SkeletonStack } from "@/components/ui/Skeleton";

interface ExerciseDetailProps {
  exerciseId: string;
}

export function ExerciseDetail({ exerciseId }: ExerciseDetailProps) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [prs, setPrs] = useState<ExercisePRs | null>(null);
  const [stats, setStats] = useState<ExerciseLifetimeStats | null>(null);
  const [unit, setUnit] = useState<Unit>("kg");
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [groupMeta, setGroupMeta] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getExercise(exerciseId), getPrs(exerciseId), getUnitPreference()])
      .then(([exerciseData, prsData, unitPref]) => {
        if (cancelled) return;
        setExercise(exerciseData);
        setPrs(prsData);
        setUnit(unitPref);
        listMuscleGroups()
          .then((groups) => {
            if (cancelled) return;
            const g = groups.find((x) => x.id === exerciseData.muscle_group_id);
            if (g) setGroupMeta({ slug: g.slug, name: g.name });
          })
          .catch(() => {});
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

    // Below-the-fold totals: same content, later slot so first paint
    // (header + last session + chart) wins the network on mobile radio.
    const idleOrTimeout: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (cancelled) return;
      getExerciseLifetimeStats(exerciseId)
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        .catch(() => {});
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(idleOrTimeout);
    };
  }, [exerciseId]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await getHistory(exerciseId, { limit: 20, cursor: nextCursor });
      setSessions((prev) => [...(prev ?? []), ...page.sessions]);
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-10 pt-4 md:max-w-3xl">
      <Link href="/exercises" className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        ← Exercises
      </Link>

      <div className="flex items-start gap-4">
        <MovementArt slug={groupMeta?.slug ?? "chest"} label={groupMeta?.name ?? "Exercise"} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="eyebrow">{groupMeta?.name ?? "Movement"}</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight md:text-4xl">
            {exercise?.name ?? "…"}
          </h1>
          {exercise && (
            <p className="text-[13px] text-muted">
              {LOAD_TYPE_LABELS[exercise.load_type]} ·{" "}
              {exercise.progression_metric === "e1rm"
                ? "Tracked by estimated max"
                : exercise.progression_metric === "top_weight"
                  ? "Tracked by heaviest set"
                  : exercise.progression_metric === "volume"
                    ? "Tracked by volume"
                    : "Tracked by reps at load"}
            </p>
          )}
        </div>
      </div>

      <div className="border-t-2 border-foreground/80 pt-4">
        <LastSessionPanel exerciseId={exerciseId} />
      </div>

      {exercise && <ExerciseCharts exercise={exercise} />}

      <div className="grid grid-cols-3 gap-4 border-t hairline pt-4 text-left">
        <div>
          <div className="numeral-giant text-3xl md:text-4xl">
            {stats ? stats.sessionCount : "—"}
          </div>
          <div className="eyebrow mt-1">Sessions</div>
        </div>
        <div>
          <div className="numeral-giant text-3xl md:text-4xl">
            {stats ? formatLoad(stats.totalVolumeGrams, unit) : "—"}
          </div>
          <div className="eyebrow mt-1">Lifetime vol</div>
        </div>
        <div>
          <div className="numeral-giant text-3xl text-acid md:text-4xl">
            {prs?.weight_pr ? prs.weight_pr.load.display : "—"}
          </div>
          <div className="eyebrow mt-1">Best</div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="eyebrow border-b hairline pb-2">Session history</h2>
        {sessions === null && <SkeletonStack rows={3} />}
        {sessions !== null && sessions.length === 0 && (
          <div className="flex flex-col gap-1 py-4">
            <p className="text-lg font-semibold">No sessions yet.</p>
            <p className="text-sm text-muted">Add it to a workout and the timeline starts here.</p>
          </div>
        )}
        {sessions !== null && sessions.length > 0 && (
          <ul className="flex flex-col">
            {sessions.map((session) => {
              const isOpen = expanded.has(session.workout_id);
              return (
                <li key={session.workout_id} className="border-b hairline">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(session.workout_id)}
                    aria-expanded={isOpen}
                    className="flex min-h-[60px] w-full items-baseline justify-between gap-2 py-3 text-left"
                  >
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span className="shrink-0 tabular-nums text-xs text-faint">
                        {formatAbsoluteDate(session.performed_on).slice(0, 6)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{formatRelativeDate(session.performed_on)}</span>
                        <span className="block text-xs text-muted">
                          {formatAbsoluteDate(session.performed_on)}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-[15px] font-bold">{session.volume.display}</span>
                      <span
                        aria-hidden="true"
                        className={`text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        ›
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="flex flex-col gap-0.5 pb-3 pl-8">
                      {session.sets.map((set) => (
                        <li key={set.id} className="tabular-nums text-sm text-muted">
                          {set.is_warmup && (
                            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Warmup</span>
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
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={loadingMore}
            loadingLabel="Loading…"
            onClick={() => void loadMore()}
          >
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
