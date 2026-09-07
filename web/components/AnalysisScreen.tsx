"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getMuscleGroupVolume,
  getPlateaus,
  type MuscleGroupVolume,
  type Plateau,
} from "@/lib/api/analytics";
import { analyzeProgress, type ProgressInsight } from "@/lib/api/ai";
import { listWorkouts, type WorkoutSummary } from "@/lib/api/workouts";
import { SimpleBarChart, type BarPoint } from "@/components/charts/SimpleBarChart";
import { ApiError } from "@/lib/api/errors";

const WORKOUT_FREQUENCY_WEEKS = 12;
const WORKOUTS_FETCH_LIMIT = 100;

function weekStartKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

/** Zero-filled bar per week for the trailing WORKOUT_FREQUENCY_WEEKS, oldest first. */
function buildWeeklyFrequency(workouts: WorkoutSummary[]): BarPoint[] {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const key = weekStartKey(w.performed_on);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: BarPoint[] = [];
  for (let i = WORKOUT_FREQUENCY_WEEKS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const key = weekStartKey(d.toISOString().slice(0, 10));
    const count = counts.get(key) ?? 0;
    points.push({
      label: new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      value: count,
      display: `${count} workout${count === 1 ? "" : "s"}`,
    });
  }
  return points;
}

function muscleGroupBars(groups: MuscleGroupVolume[]): BarPoint[] {
  return groups
    .slice()
    .sort((a, b) => b.volume.grams - a.volume.grams)
    .map((g) => ({
      label: g.muscle_group_name,
      value: g.volume.grams,
      display: `${g.volume.display} · ${g.working_set_count} sets`,
    }));
}

export function AnalysisScreen() {
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroupVolume[] | null>(null);
  const [frequency, setFrequency] = useState<BarPoint[] | null>(null);
  const [plateaus, setPlateaus] = useState<Plateau[] | null>(null);
  const [insight, setInsight] = useState<ProgressInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightFailed, setInsightFailed] = useState(false);
  const [insightRequested, setInsightRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function requestInsight() {
    setInsightRequested(true);
    setInsightLoading(true);
    setInsightFailed(false);
    analyzeProgress("90d")
      .then((data) => {
        setInsight(data.insight);
        setInsightLoading(false);
      })
      .catch(() => {
        // The AI section is never a hard dependency of this screen.
        setInsightLoading(false);
        setInsightFailed(true);
      });
  }

  useEffect(() => {
    let cancelled = false;

    getMuscleGroupVolume("30d")
      .then((data) => {
        if (!cancelled) setMuscleGroups(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load analysis");
      });

    listWorkouts({ limit: WORKOUTS_FETCH_LIMIT })
      .then((page) => {
        if (!cancelled) setFrequency(buildWeeklyFrequency(page.workouts));
      })
      .catch(() => {
        if (!cancelled) setFrequency([]);
      });

    getPlateaus()
      .then((data) => {
        if (!cancelled) setPlateaus(data);
      })
      .catch(() => {
        if (!cancelled) setPlateaus([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="p-4 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Analysis</h1>

      <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Training notes
          </h2>
          <span className="rounded-full border border-accent/50 px-2 py-0.5 text-xs text-accent">
            AI interpretation
          </span>
        </div>
        {insightLoading && (
          <div className="h-20 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
        )}
        {!insightLoading && insight && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm">{insight.summary}</p>
            <button
              type="button"
              onClick={requestInsight}
              className="h-9 rounded-lg border border-border px-4 text-sm"
            >
              Analyze again
            </button>
          </div>
        )}
        {!insightLoading && !insightRequested && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">
              Get an AI-written read of your last 90 days. Uses AI credits.
            </p>
            <button
              type="button"
              onClick={requestInsight}
              className="h-11 rounded-lg bg-accent px-5 text-sm font-medium text-white"
            >
              Analyze
            </button>
          </div>
        )}
        {!insightLoading && insightRequested && !insight && insightFailed && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">AI analysis unavailable right now.</p>
            <button
              type="button"
              onClick={requestInsight}
              className="h-9 rounded-lg border border-border px-4 text-sm"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Muscle group volume (30 days)
          </h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            Calculated
          </span>
        </div>
        {muscleGroups === null && (
          <div className="h-[180px] animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
        )}
        {muscleGroups !== null && muscleGroups.length === 0 && (
          <p className="text-sm text-muted">No sets logged in the last 30 days.</p>
        )}
        {muscleGroups !== null && muscleGroups.length > 0 && (
          <SimpleBarChart data={muscleGroupBars(muscleGroups)} />
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Workout frequency (12 weeks)
          </h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            Calculated
          </span>
        </div>
        {frequency === null && (
          <div className="h-[180px] animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
        )}
        {frequency !== null && frequency.every((p) => p.value === 0) && (
          <p className="text-sm text-muted">No workouts logged in the last 12 weeks.</p>
        )}
        {frequency !== null && frequency.some((p) => p.value > 0) && (
          <SimpleBarChart data={frequency} color="var(--color-success)" />
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Plateaus</h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            Calculated
          </span>
        </div>
        {plateaus === null && (
          <div className="h-16 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
        )}
        {plateaus !== null && plateaus.length === 0 && (
          <p className="text-sm text-muted">
            No plateaus detected — every tracked lift has moved in the last 6 weeks.
          </p>
        )}
        {plateaus !== null && plateaus.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {plateaus.map((p) => (
              <li key={p.exercise_id} className="py-2 text-sm">
                <Link href={`/exercises/${p.exercise_id}`} className="font-medium">
                  {p.exercise_name}
                </Link>
                <p className="text-muted">
                  No new best in {p.weeks_since_new_best}{" "}
                  {p.weeks_since_new_best === 1 ? "week" : "weeks"} — {p.session_count} sessions
                  over {p.window_days} days.
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
