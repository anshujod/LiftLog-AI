"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";
import { getDashboard, type Dashboard as DashboardData } from "@/lib/api/analytics";
import { getWorkout, listWorkouts } from "@/lib/api/workouts";
import { getLastSession } from "@/lib/api/exercises";
import { ApiError } from "@/lib/api/errors";

interface SuggestionExercise {
  id: string;
  name: string;
  topSetDisplay: string | null;
}

interface Suggestion {
  workoutTitle: string | null;
  exercises: SuggestionExercise[];
}

async function loadSuggestion(): Promise<Suggestion | null> {
  const page = await listWorkouts({ limit: 5 });
  const lastFinished = page.workouts.find((w) => w.ended_at !== null);
  if (!lastFinished) return null;

  const workout = await getWorkout(lastFinished.id);
  if (workout.workout_exercises.length === 0) return null;

  const exercises = await Promise.all(
    workout.workout_exercises.map(async (we): Promise<SuggestionExercise> => {
      let topSetDisplay: string | null = null;
      try {
        const last = await getLastSession(we.exercise.id);
        const workingSets = last.session?.sets.filter((s) => !s.is_warmup) ?? [];
        const top = workingSets.reduce<(typeof workingSets)[number] | null>(
          (best, s) => (!best || s.load.grams > best.load.grams ? s : best),
          null
        );
        topSetDisplay = top ? `${top.load.display} × ${top.reps}` : null;
      } catch {
        // missing a top-set line for one exercise isn't worth failing the card over
      }
      return { id: we.exercise.id, name: we.exercise.name, topSetDisplay };
    })
  );

  return { workoutTitle: workout.title, exercises };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tabular-nums text-xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </div>
  );
}

export function Dashboard() {
  const { logout } = useAuth();
  const activeWorkoutId = useActiveWorkoutId();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSuggestion()
      .then((s) => {
        if (!cancelled) setSuggestion(s);
      })
      .catch(() => {
        if (!cancelled) setSuggestion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
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

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!error && data === null && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {!activeWorkoutId && suggestion && suggestion.exercises.length > 0 && (
        <SectionCard title="Today's suggestion">
          {suggestion.workoutTitle && <p className="text-sm">{suggestion.workoutTitle}</p>}
          <ul className="flex flex-col gap-1">
            {suggestion.exercises.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between text-sm">
                <span>{ex.name}</span>
                {ex.topSetDisplay && (
                  <span className="tabular-nums text-muted">{ex.topSetDisplay}</span>
                )}
              </li>
            ))}
          </ul>
          <Link
            href={`/workout?suggest=${suggestion.exercises.map((e) => e.id).join(",")}`}
            className="mt-1 flex h-11 items-center justify-center rounded-lg bg-accent text-sm font-medium text-white"
          >
            Start this workout
          </Link>
        </SectionCard>
      )}

      {data && data.top_improving_exercises.length > 0 && (
        <SectionCard title="Recent progress">
          <ul className="flex flex-col gap-1.5">
            {data.top_improving_exercises.map((ex) => (
              <li key={ex.exercise_id} className="flex items-center justify-between text-sm">
                <Link href={`/exercises/${ex.exercise_id}`}>{ex.exercise_name}</Link>
                <span className="tabular-nums text-success">+{ex.percent_change}%</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {data && data.recent_prs.length > 0 && (
        <SectionCard title="Recent PRs">
          <ul className="flex flex-col gap-1.5">
            {data.recent_prs.map((pr) => (
              <li key={`${pr.exercise_id}-${pr.pr_type}-${pr.performed_on}`} className="text-sm">
                🏆 {pr.exercise_name} — <span className="tabular-nums">{pr.value.display}</span>
                {pr.reps ? ` × ${pr.reps}` : ""}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {data && (data.weekly_volume.current_week.grams > 0 || data.weekly_volume.previous_week.grams > 0) && (
        <SectionCard title="Weekly volume">
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-xl font-semibold">
              {data.weekly_volume.current_week.display}
            </span>
            {data.weekly_volume.percent_change !== null ? (
              <span
                className={`tabular-nums text-sm ${data.weekly_volume.percent_change >= 0 ? "text-success" : "text-danger"}`}
              >
                {data.weekly_volume.percent_change >= 0 ? "+" : ""}
                {data.weekly_volume.percent_change}% vs last week
              </span>
            ) : (
              <span className="text-sm text-muted">first week logged</span>
            )}
          </div>
        </SectionCard>
      )}

      {data && (
        <SectionCard title="Consistency">
          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat label="Workouts (30d)" value={String(data.workout_count)} />
            <Stat label="Week streak" value={String(data.current_streak_weeks)} />
          </div>
        </SectionCard>
      )}

      <Link href="/analysis" className="text-center text-sm text-accent">
        See full analysis →
      </Link>

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
