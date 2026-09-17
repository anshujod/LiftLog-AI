"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getDashboard,
  getPlateaus,
  getVolume,
  type Plateau,
  type VolumeByPeriod,
} from "@/lib/api/analytics";
import { analyzeProgress, type ProgressInsight } from "@/lib/api/ai";
import { listWorkouts, type WorkoutSummary } from "@/lib/api/workouts";
import { SimpleBarChart, type BarPoint } from "@/components/charts/SimpleBarChart";
import { MuscleMapCard } from "@/components/MuscleMap/MuscleMapCard";
import { RecoveryCard } from "@/components/MuscleMap/RecoveryCard";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";
import { describeVolumeDelta } from "@/lib/metrics/honest";

const WORKOUT_FREQUENCY_WEEKS = 12;
const WORKOUTS_FETCH_LIMIT = 100;

function weekStartKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

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

function volumeToBars(rows: VolumeByPeriod[]): BarPoint[] {
  return rows.map((r) => ({
    label: new Date(`${r.period_start}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    value: r.volume.grams,
    display: r.volume.display,
  }));
}

function FrequencyVerdict({ points }: { points: BarPoint[] }) {
  if (points.length < 8) return null;
  const recent = points.slice(-4);
  const prior = points.slice(-8, -4);
  const avg = (xs: BarPoint[]) => xs.reduce((n, p) => n + p.value, 0) / xs.length;
  const r = avg(recent);
  const p = avg(prior);
  const text =
    r === 0 && p === 0
      ? "No sessions in the last 8 weeks."
      : r > p
        ? `Training about ${r.toFixed(1)} times per week lately, up from ${p.toFixed(1)}.`
        : r < p
          ? `Training about ${r.toFixed(1)} times per week lately, down from ${p.toFixed(1)}.`
          : `Holding steady at about ${r.toFixed(1)} sessions per week.`;
  return (
    <p className="text-[13px] text-muted" aria-live="polite">
      {text}
    </p>
  );
}

export function ProgressScreen() {
  const [frequency, setFrequency] = useState<BarPoint[] | null>(null);
  const [volumeBars, setVolumeBars] = useState<BarPoint[] | null>(null);
  const [plateaus, setPlateaus] = useState<Plateau[] | null>(null);
  const [improvers, setImprovers] = useState<{ id: string; name: string; pct: number }[] | null>(null);
  const [insight, setInsight] = useState<ProgressInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightFailed, setInsightFailed] = useState(false);
  const [insightRequested, setInsightRequested] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [weeklyDelta, setWeeklyDelta] = useState<ReturnType<typeof describeVolumeDelta> | null>(null);

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
        setInsightLoading(false);
        setInsightFailed(true);
      });
  }

  useEffect(() => {
    let cancelled = false;

    listWorkouts({ limit: WORKOUTS_FETCH_LIMIT })
      .then((page) => {
        if (cancelled) return;
        setFrequency(buildWeeklyFrequency(page.workouts));
        setWorkouts(page.workouts.slice(0, 20));
        setNextCursor(page.next_cursor);
      })
      .catch(() => {
        if (!cancelled) {
          setFrequency([]);
          setWorkouts([]);
        }
      });

    getVolume("90d", "week")
      .then((rows) => {
        if (!cancelled) setVolumeBars(volumeToBars(rows));
      })
      .catch(() => {
        if (!cancelled) setVolumeBars([]);
      });

    getPlateaus()
      .then((data) => {
        if (!cancelled) setPlateaus(data);
      })
      .catch(() => {
        if (!cancelled) setPlateaus([]);
      });

    getDashboard()
      .then((d) => {
        if (cancelled) return;
        setImprovers(
          d.top_improving_exercises.map((e) => ({
            id: e.exercise_id,
            name: e.exercise_name,
            pct: e.percent_change,
          }))
        );
        setWeeklyDelta(
          describeVolumeDelta(
            d.weekly_volume.current_week.grams,
            d.weekly_volume.previous_week.grams,
            d.weekly_volume.percent_change
          )
        );
      })
      .catch(() => {
        if (!cancelled) setImprovers([]);
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
      setWorkouts((prev) => [...(prev ?? []), ...page.workouts.slice(0, 20)]);
      setNextCursor(page.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-12 px-4 pb-12 pt-4 md:max-w-4xl md:px-8">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Training history — Frequency · Volume · Body</p>
        <h1 className="font-display text-[clamp(36px,9vw,60px)] leading-[0.95]">
          Progress<span className="text-acid">.</span>
        </h1>
      </div>

      {/* BODY HERO */}
      <MuscleMapCard />
      <RecoveryCard />

      {/* ARE YOU TRAINING MORE? */}
      <section className="flex flex-col gap-3 border-t-2 border-foreground/80 pt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">Are you training more?</h2>
          <span className="text-[11px] uppercase tracking-[0.14em] text-faint">Weekly volume · 90d</span>
        </div>
        {volumeBars === null && <Skeleton className="h-[180px]" />}
        {volumeBars !== null && volumeBars.every((p) => p.value === 0) && (
          <div className="flex flex-col gap-1 py-4">
            <p className="text-lg font-semibold">No volume yet.</p>
            <p className="text-sm text-muted">Finish a session and the bars start here.</p>
          </div>
        )}
        {volumeBars !== null && volumeBars.some((p) => p.value > 0) && (
          <>
            <SimpleBarChart data={volumeBars} />
            {weeklyDelta && (
              <p className="text-[13px] text-muted" aria-live="polite">
                {weeklyDelta.kind === "delta"
                  ? weeklyDelta.up
                    ? `Training more — ${weeklyDelta.label.toLowerCase()}.`
                    : `Training less — ${weeklyDelta.label.toLowerCase()}.`
                  : `${weeklyDelta.label}.`}
              </p>
            )}
          </>
        )}
      </section>

      {/* HOW OFTEN? */}
      <section className="flex flex-col gap-3 border-t hairline pt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">How often?</h2>
          <span className="text-[11px] uppercase tracking-[0.14em] text-faint">12 weeks</span>
        </div>
        {frequency === null && <Skeleton className="h-[180px]" />}
        {frequency !== null && frequency.every((p) => p.value === 0) && (
          <p className="py-4 text-sm text-muted">No sessions in the last 12 weeks.</p>
        )}
        {frequency !== null && frequency.some((p) => p.value > 0) && (
          <>
            <SimpleBarChart data={frequency} color="var(--foreground)" />
            <FrequencyVerdict points={frequency} />
          </>
        )}
      </section>

      {/* WHAT IS IMPROVING / STUCK */}
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow border-b hairline pb-2">What is improving?</h2>
          {improvers === null && <Skeleton className="h-16" />}
          {improvers !== null && improvers.length === 0 && (
            <p className="py-2 text-sm text-muted">Need 3+ sessions per lift to call a trend.</p>
          )}
          {improvers !== null && improvers.length > 0 && (
            <ul className="flex flex-col">
              {improvers.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-2 py-2">
                  <Link href={`/exercises/${e.id}`} className="truncate text-lg font-semibold tracking-tight hover:text-acid">
                    {e.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-acid">+{e.pct}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="eyebrow border-b hairline pb-2">Where are you stuck?</h2>
          {plateaus === null && <Skeleton className="h-16" />}
          {plateaus !== null && plateaus.length === 0 && (
            <p className="py-2 text-sm text-muted">No plateaus — every lift moved in the last 6 weeks.</p>
          )}
          {plateaus !== null && plateaus.length > 0 && (
            <ul className="flex flex-col">
              {plateaus.map((p) => (
                <li key={p.exercise_id} className="border-b hairline py-2.5">
                  <Link href={`/exercises/${p.exercise_id}`} className="text-[16px] font-medium hover:text-acid">
                    {p.exercise_name}
                  </Link>
                  <p className="text-sm text-muted">
                    No new best in {p.weeks_since_new_best}{" "}
                    {p.weeks_since_new_best === 1 ? "week" : "weeks"} — {p.session_count} sessions
                    over {p.window_days} days.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* COACH NOTE */}
      <section className="flex flex-col gap-3 border-t hairline pt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">Coach note — 90 days</h2>
          <span className="text-[11px] uppercase tracking-[0.14em] text-acid">AI interpretation</span>
        </div>
        {insightLoading && <Skeleton className="h-20" />}
        {!insightLoading && insight && (
          <div className="flex flex-col items-start gap-2">
            <p className="max-w-xl text-[15px] leading-relaxed">{insight.summary}</p>
            <Button size="sm" variant="secondary" onClick={requestInsight}>
              Analyze again
            </Button>
          </div>
        )}
        {!insightLoading && !insightRequested && (
          <div className="flex flex-col items-start gap-2">
            <p className="max-w-md text-sm text-muted">
              A grounded read of your last 90 days. Numbers come from your log. Uses AI credits.
            </p>
            <Button size="sm" variant="primary" onClick={requestInsight}>
              Analyze
            </Button>
          </div>
        )}
        {!insightLoading && insightRequested && !insight && insightFailed && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">Analysis unavailable right now.</p>
            <Button size="sm" variant="secondary" onClick={requestInsight}>
              Retry
            </Button>
          </div>
        )}
      </section>

      {/* TIMELINE */}
      <section className="flex flex-col gap-2">
        <h2 className="eyebrow border-b hairline pb-2">Session timeline</h2>
        {workouts === null && <Skeleton className="h-24" />}
        {workouts !== null && workouts.length === 0 && (
          <div className="flex flex-col gap-1 py-4">
            <p className="text-lg font-semibold">No sessions yet.</p>
            <p className="text-sm text-muted">Finished workouts line up here, newest first.</p>
          </div>
        )}
        {workouts !== null && workouts.length > 0 && (
          <ul className="flex flex-col">
            {workouts.map((w, i) => (
              <li key={w.id} className="border-b hairline">
                <Link
                  href={`/workout/${w.id}`}
                  className="flex min-h-[68px] items-baseline justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 items-baseline gap-3">
                    <span className="shrink-0 tabular-nums text-xs text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-medium">
                        {w.title ?? "Workout"}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatRelativeDate(w.performed_on)} · {formatAbsoluteDate(w.performed_on)}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    {w.ended_at === null && (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-acid">
                        <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse bg-acid" />
                        Live
                      </span>
                    )}
                    <span className="tabular-nums">{w.exercise_count} EX</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3 w-full"
            loading={loadingMore}
            loadingLabel="Loading…"
            onClick={() => void loadMore()}
          >
            Load more
          </Button>
        )}
      </section>
    </div>
  );
}
