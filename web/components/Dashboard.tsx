"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";
import { getDashboard, type Dashboard as DashboardData } from "@/lib/api/analytics";
import { weeklySummary, type WeekSummary } from "@/lib/api/ai";
import { getWorkout, listWorkouts } from "@/lib/api/workouts";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Skeleton } from "@/components/ui/Skeleton";
import { BodyweightErrorAction } from "@/components/BodyweightErrorAction";
import { isBodyweightRequired, onBodyweightSaved } from "@/lib/api/bodyweight-events";
import { collapseRecentPrs } from "@/lib/prs";
import { describeVolumeDelta } from "@/lib/metrics/honest";

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

  // Derive top sets from the workout itself — no N+1 getLastSession fan-out.
  // The last finished workout's own working sets are exactly "what you did
  // last time", and this keeps the suggestion to 2 requests total.
  const exercises: SuggestionExercise[] = workout.workout_exercises.map((we) => {
    const workingSets = (we.sets ?? []).filter((s) => !s.is_warmup);
    const top = workingSets.reduce<(typeof workingSets)[number] | null>(
      (best, s) => (!best || s.load.grams > best.load.grams ? s : best),
      null
    );
    return {
      id: we.exercise.id,
      name: we.exercise.name,
      topSetDisplay: top ? `${top.load.display} × ${top.reps}` : null,
    };
  });

  return { workoutTitle: workout.title, exercises };
}

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

function statusChip(
  activeWorkoutId: string | null,
  weeklyGrams: number | undefined,
  workoutCount: number | undefined,
  streak: number | undefined
): string {
  if (activeWorkoutId) return "Live now";
  if (weeklyGrams === 0 || workoutCount === 0) return "Start your week";
  if ((streak ?? 0) >= 2) return "On track";
  if ((workoutCount ?? 0) === 0) return "Start your week";
  return "Ready to train";
}

export function Dashboard({ initialData }: { initialData?: DashboardData | null }) {
  const activeWorkoutId = useActiveWorkoutId();
  const [data, setData] = useState<DashboardData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [needsBodyweight, setNeedsBodyweight] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [weekReview, setWeekReview] = useState<WeekSummary | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekFailed, setWeekFailed] = useState(false);

  const loadDashboard = useCallback(async () => {
    setError(null);
    setNeedsBodyweight(false);
    try {
      setData(await getDashboard());
    } catch (err) {
      if (isBodyweightRequired(err)) {
        setNeedsBodyweight(true);
        setError(err instanceof ApiError ? err.message : "Body weight is needed.");
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't load dashboard");
      }
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
    // Server may have already rendered initialData — skip the duplicate fetch
    // on mount so cold open costs one server request, not server + client.
    if (initialData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard, initialData]);

  useEffect(() => {
    return onBodyweightSaved(() => {
      void loadDashboard();
    });
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let rafId = 0;
    let fallbackId: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (cancelled || started) return;
      started = true;
      loadSuggestion()
        .then((s) => {
          if (!cancelled) setSuggestion(s);
        })
        .catch(() => {
          if (!cancelled) setSuggestion(null);
        });
    };
    // Below-the-fold nice-to-have: let first paint (status + dashboard data)
    // win the network, then resolve the suggestion. Same content, later slot.
    if (typeof requestAnimationFrame !== "undefined") {
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fallbackId) clearTimeout(fallbackId);
          run();
        });
      });
      // rAF never fires in a background tab — fall back to a timer.
      fallbackId = setTimeout(run, 2000);
    } else {
      fallbackId = setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (fallbackId) clearTimeout(fallbackId);
    };
  }, []);

  const headlinePrs = data ? collapseRecentPrs(data.recent_prs).slice(0, 3) : [];
  const weekly = data?.weekly_volume;
  const delta = weekly
    ? describeVolumeDelta(
        weekly.current_week.grams,
        weekly.previous_week.grams,
        weekly.percent_change
      )
    : null;
  const status = statusChip(
    activeWorkoutId,
    weekly?.current_week.grams,
    data?.workout_count,
    data?.current_streak_weeks
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-10 pt-2 md:max-w-3xl md:px-8 md:pt-6 lg:max-w-4xl">
      {/* STATUS STRIP — 3-second read */}
      <header className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">{TODAY_LABEL}</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">
            {data ? `${data.workout_count} / 30D` : "—"}
          </p>
        </div>

        <div className="flex items-center gap-2" aria-live="polite">
          <span
            aria-hidden="true"
            className={`h-2 w-2 ${activeWorkoutId ? "animate-pulse bg-acid" : "bg-acid"}`}
          />
          <p className="text-sm font-semibold">{status}</p>
          {data && data.current_streak_weeks >= 2 && (
            <p className="text-xs text-muted">· {data.current_streak_weeks}-week streak</p>
          )}
        </div>

        {!error && data === null && (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        )}

        {!error && data !== null && weekly && delta && (
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            {delta.kind !== "empty-week" && (
              <p className="numeral-giant text-[clamp(40px,9vw,64px)]">
                {weekly.current_week.display}
              </p>
            )}
            <div className="flex flex-col gap-1 pb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                Volume this week
              </p>
              {delta.kind === "delta" ? (
                <p
                  className={`tabular-nums text-sm font-bold ${
                    delta.up ? "text-acid" : "text-danger"
                  }`}
                >
                  {delta.label}
                </p>
              ) : (
                <p className="text-sm text-muted">{delta.label}</p>
              )}
            </div>
          </div>
        )}

        {activeWorkoutId ? (
          <Link
            href={`/workout?resume=${activeWorkoutId}`}
            className="slab-press flex min-h-[76px] items-center justify-between bg-acid px-5 text-background"
          >
            <span className="font-display text-2xl tracking-wide md:text-3xl">
              Resume workout
            </span>
            <span aria-hidden="true" className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse bg-background" />
              <span className="font-display text-2xl">→</span>
            </span>
          </Link>
        ) : (
          <Link
            href="/workout"
            className="slab-press flex min-h-[76px] items-center justify-between bg-acid px-5 text-background"
          >
            <span className="font-display text-2xl tracking-wide md:text-3xl">
              Start workout
            </span>
            <span aria-hidden="true" className="font-display text-2xl">
              →
            </span>
          </Link>
        )}

        {!activeWorkoutId && suggestion && suggestion.exercises.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Today — {suggestion.workoutTitle ?? "Last session"}</p>
              {/* sentence-case rows below carry the detail; header stays a label */}
              <Link
                href={`/workout?suggest=${suggestion.exercises.map((e) => e.id).join(",")}`}
                className="text-xs font-bold uppercase tracking-[0.14em] text-foreground underline decoration-faint underline-offset-4"
              >
                Start →
              </Link>
            </div>
            <ul className="flex flex-col">
              {suggestion.exercises.slice(0, 5).map((ex, i) => (
                <li
                  key={ex.id}
                  className="flex items-baseline gap-3 border-b hairline py-2.5 text-[15px]"
                >
                  <span className="tabular-nums text-xs text-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{ex.name}</span>
                  {ex.topSetDisplay && (
                    <span className="shrink-0 tabular-nums text-sm text-muted">
                      {ex.topSetDisplay}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      {error && (
        <ErrorNote
          message={error}
          action={
            needsBodyweight ? (
              <BodyweightErrorAction onSaved={() => void loadDashboard()} />
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void loadDashboard()}>
                Retry
              </Button>
            )
          }
        />
      )}

      {data && data.workout_count === 0 && !suggestion && (
        <EmptyState
          title="No training data yet"
          body="Log your first session and this console fills with volume, records and momentum."
          action={
            <Link
              href="/workout"
              className="text-sm font-bold uppercase tracking-[0.14em] text-acid"
            >
              Log first session →
            </Link>
          }
        />
      )}

      {/* PROGRESS + ACHIEVEMENTS — quiet rows, sentence-case content */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.2fr_1fr] md:gap-12">
        {data && data.top_improving_exercises.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow border-b hairline pb-2">Getting stronger</h2>
            <ul className="flex flex-col">
              {data.top_improving_exercises.slice(0, 3).map((ex) => (
                <li key={ex.exercise_id} className="flex items-baseline gap-3 py-2">
                  <Link
                    href={`/exercises/${ex.exercise_id}`}
                    className="min-w-0 flex-1 truncate text-[16px] font-medium hover:text-acid"
                  >
                    {ex.exercise_name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-acid">
                    +{ex.percent_change}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {headlinePrs.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="eyebrow border-b hairline pb-2">Recent bests</h2>
            <ul className="flex flex-col">
              {headlinePrs.map((pr) => (
                <li key={pr.exercise_id} className="flex items-baseline gap-2 py-2 text-[15px]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-acid" />
                  <Link
                    href={`/exercises/${pr.exercise_id}`}
                    className="min-w-0 flex-1 truncate font-normal hover:text-acid"
                  >
                    {pr.exercise_name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-sm text-muted">
                    {pr.value.display}
                    {pr.reps ? ` × ${pr.reps}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* TRAINING RHYTHM — one quiet line */}
      {data && data.workout_count > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between border-b hairline pb-2">
            <h2 className="eyebrow">This month</h2>
            <Link
              href="/progress"
              className="text-xs font-bold uppercase tracking-[0.14em] text-foreground underline decoration-faint underline-offset-4"
            >
              Full map →
            </Link>
          </div>
          <Link href="/progress" className="group flex items-baseline justify-between gap-3 py-1">
            <span className="text-[16px] font-medium">
              {data.workout_count} sessions in the last 30 days
              {data.current_streak_weeks >= 2 ? ` · ${data.current_streak_weeks}-week streak` : ""}
            </span>
            <span aria-hidden="true" className="text-muted">→</span>
          </Link>
        </div>
      )}

      {/* WEEK IN REVIEW — single row, opens on demand */}
      <section className="flex flex-col gap-3 border-t hairline pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">Week in review</h2>
          {!weekReview && !weekLoading && !weekFailed && (
            <button
              type="button"
              onClick={() => void loadWeekReview()}
              className="text-xs font-bold uppercase tracking-[0.14em] text-acid"
            >
              Review →
            </button>
          )}
        </div>
        {!weekReview && !weekLoading && !weekFailed && (
          <p className="max-w-md text-sm text-muted">
            Sessions, volume, PRs and one coach observation. Uses AI credits.
          </p>
        )}
        {weekLoading && <Skeleton className="h-20" />}
        {weekFailed && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted">Review unavailable.</p>
            <button
              type="button"
              onClick={() => void loadWeekReview()}
              className="text-xs font-bold uppercase tracking-[0.14em] text-foreground underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        )}
        {weekReview && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <p className="tabular-nums text-xl font-bold">{weekReview.workouts_completed} sessions</p>
              <p className="tabular-nums text-sm text-muted">
                {weekReview.total_volume.display} total
              </p>
            </div>
            {weekReview.observation ? (
              <p className="max-w-xl text-[15px] leading-relaxed">{weekReview.observation}</p>
            ) : (
              <p className="text-sm text-muted">Numbers above are exact.</p>
            )}
            {weekReview.cached && <p className="text-xs text-faint">Saved from earlier.</p>}
          </div>
        )}
        <Link
          href="/progress"
          className="pt-1 text-xs font-bold uppercase tracking-[0.14em] text-muted"
        >
          See full progress →
        </Link>
      </section>
    </div>
  );
}
