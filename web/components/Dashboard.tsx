"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";
import { getDashboard, type Dashboard as DashboardData } from "@/lib/api/analytics";
import { weeklySummary, type WeekSummary } from "@/lib/api/ai";
import { getWorkout, listWorkouts } from "@/lib/api/workouts";
import { getLastSession } from "@/lib/api/exercises";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";

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

export function Dashboard() {
  const { logout } = useAuth();
  const activeWorkoutId = useActiveWorkoutId();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [weekReview, setWeekReview] = useState<WeekSummary | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekFailed, setWeekFailed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      setData(await getDashboard());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load dashboard");
    }
  }, []);

  async function loadWeekReview() {
    setWeekLoading(true);
    setWeekFailed(false);
    try {
      setWeekReview(await weeklySummary());
    } catch {
      setWeekFailed(true);
    } finally {
      setWeekLoading(false);
    }
  }

  useEffect(() => {
    // Initial fetch only — Retry re-runs the same loader on demand.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

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
          className="flex h-16 items-center justify-center rounded-lg bg-accent-fill text-lg font-medium text-white"
        >
          Resume workout
        </Link>
      ) : (
        <Link
          href="/workout"
          className="flex h-16 items-center justify-center rounded-lg bg-accent-fill text-lg font-medium text-white"
        >
          Start workout
        </Link>
      )}

      {error && (
        <ErrorNote
          message={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => void loadDashboard()}>
              Retry
            </Button>
          }
        />
      )}

      {!error && data === null && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {!activeWorkoutId && suggestion && suggestion.exercises.length > 0 && (
        <Card title="Today's suggestion">
          {suggestion.workoutTitle && <p className="text-sm">{suggestion.workoutTitle}</p>}
          <ul className="flex flex-col gap-1">
            {suggestion.exercises.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between text-sm">
                <span>{ex.name}</span>
                {ex.topSetDisplay && (
                  <span className="ml-3 shrink-0 tabular-nums text-muted">{ex.topSetDisplay}</span>
                )}
              </li>
            ))}
          </ul>
          <Link
            href={`/workout?suggest=${suggestion.exercises.map((e) => e.id).join(",")}`}
            className="mt-1 flex h-11 items-center justify-center rounded-lg bg-accent-fill text-sm font-medium text-white"
          >
            Start this workout
          </Link>
        </Card>
      )}

      {data && data.workout_count === 0 && !suggestion && (
        <EmptyState
          title="No training data yet"
          body="Log your first workout and this page fills in with progress, PRs, and trends."
        />
      )}

      {data && data.top_improving_exercises.length > 0 && (
        <Card title="Recent progress">
          <ul className="flex flex-col gap-1.5">
            {data.top_improving_exercises.map((ex) => (
              <li key={ex.exercise_id} className="flex items-center justify-between gap-2 text-sm">
                <Link
                  href={`/exercises/${ex.exercise_id}`}
                  className="min-w-0 truncate py-0.5 text-accent hover:underline"
                >
                  {ex.exercise_name}
                </Link>
                <span className="shrink-0 tabular-nums text-success">+{ex.percent_change}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.recent_prs.length > 0 && (
        <Card title="Recent PRs">
          <ul className="flex flex-col gap-1.5">
            {data.recent_prs.map((pr) => (
              <li
                key={`${pr.exercise_id}-${pr.pr_type}-${pr.performed_on}`}
                className="flex min-w-0 items-center gap-1 text-sm"
              >
                <span aria-hidden="true">🏆</span>
                <span className="min-w-0 truncate">{pr.exercise_name}</span>
                <span className="shrink-0">
                  — <span className="tabular-nums">{pr.value.display}</span>
                  {pr.reps ? ` × ${pr.reps}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && (data.weekly_volume.current_week.grams > 0 || data.weekly_volume.previous_week.grams > 0) && (
        <Card title="Weekly volume">
          <div className="flex items-baseline gap-2">
            <span className="tabular-nums text-xl font-semibold">
              {data.weekly_volume.current_week.display}
            </span>
            {data.weekly_volume.percent_change !== null ? (
              <span
                className={`tabular-nums text-sm ${data.weekly_volume.percent_change >= 0 ? "text-success" : "text-danger"}`}
              >
                <span aria-hidden="true">{data.weekly_volume.percent_change >= 0 ? "▲" : "▼"}</span>{" "}
                {data.weekly_volume.percent_change >= 0 ? "+" : ""}
                {data.weekly_volume.percent_change}% vs last week
              </span>
            ) : (
              <span className="text-sm text-muted">first week logged</span>
            )}
          </div>
        </Card>
      )}

      {data && (
        <Card title="Consistency">
          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat label="Workouts (30d)" value={String(data.workout_count)} />
            <Stat label="Week streak" value={String(data.current_streak_weeks)} />
          </div>
        </Card>
      )}

      <Card title="Week in review">
        {!weekReview && !weekLoading && !weekFailed && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">
              Workouts, volume, PRs, and one AI observation for this week. Uses AI credits.
            </p>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void loadWeekReview()}
            >
              Review my week
            </Button>
          </div>
        )}
        {weekLoading && (
          <div className="h-24 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />
        )}
        {weekFailed && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">Week review unavailable right now.</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadWeekReview()}
            >
              Retry
            </Button>
          </div>
        )}
        {weekReview && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="grid grid-cols-2 gap-2 text-center">
              <Stat label="Workouts" value={String(weekReview.workouts_completed)} />
              <Stat label="Volume" value={weekReview.total_volume.display} />
            </div>
            {weekReview.changes.length > 0 && (
              <ul className="flex flex-col gap-1">
                {weekReview.changes.map((change) => (
                  <li key={change.exercise_name} className="flex items-center justify-between">
                    <span>{change.exercise_name}</span>
                    <span className="tabular-nums text-muted">
                      {change.previous_display} → {change.current_display}
                      {change.percent_change !== null && ` (${change.percent_change}%)`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {weekReview.new_prs.length > 0 && (
              <div className="flex flex-col gap-1">
                {weekReview.new_prs.map((pr) => (
                  <p key={`${pr.exercise_id}-${pr.pr_type}`} className="text-sm">
                    <span aria-hidden="true">🏆</span> {pr.exercise_name} — {pr.value.display}
                    {pr.reps ? ` × ${pr.reps}` : ""}
                  </p>
                ))}
              </div>
            )}
            {weekReview.observation ? (
              <p>{weekReview.observation}</p>
            ) : (
              <p className="text-muted">AI observation unavailable — numbers above are exact.</p>
            )}
            {weekReview.cached && <p className="text-xs text-muted">Saved from earlier.</p>}
          </div>
        )}
      </Card>

      <Link href="/analysis" className="py-2 text-center text-sm text-accent hover:underline">
        See full analysis →
      </Link>

      <Button
        variant="secondary"
        size="md"
        className="w-fit"
        loading={loggingOut}
        onClick={() => {
          setLoggingOut(true);
          void logout().finally(() => setLoggingOut(false));
        }}
      >
        Log out
      </Button>
    </div>
  );
}
