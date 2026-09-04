"use client";

import { useEffect, useState } from "react";
import { getHistory, type Exercise, type SessionSummary } from "@/lib/api/exercises";
import { TrendLineChart, type TrendPoint } from "@/components/charts/TrendLineChart";

const HISTORY_LIMIT = 100;
const MIN_POINTS = 2;

interface ExerciseChartsProps {
  exercise: Exercise;
}

/** history.sessions comes back newest-first (for pagination); charts read
 * left-to-right chronologically, so every series here reverses it first. */
function toVolumeSeries(sessions: SessionSummary[]): TrendPoint[] {
  return sessions
    .slice()
    .reverse()
    .map((s) => ({ date: s.performed_on, value: s.volume.grams, display: s.volume.display }));
}

function toE1rmSeries(sessions: SessionSummary[]): TrendPoint[] {
  return sessions
    .slice()
    .reverse()
    .filter((s) => s.best_e1rm !== null)
    .map((s) => ({
      date: s.performed_on,
      value: s.best_e1rm!.grams,
      display: s.best_e1rm!.display,
    }));
}

function toTopWeightSeries(sessions: SessionSummary[]): TrendPoint[] {
  return sessions
    .slice()
    .reverse()
    .map((s) => {
      const working = s.sets.filter((set) => !set.is_warmup);
      if (working.length === 0) return null;
      const top = working.reduce((best, set) => (set.load.grams > best.load.grams ? set : best));
      return { date: s.performed_on, value: top.load.grams, display: top.load.display };
    })
    .filter((p): p is TrendPoint => p !== null);
}

export function ExerciseCharts({ exercise }: ExerciseChartsProps) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHistory(exercise.id, { limit: HISTORY_LIMIT })
      .then((page) => {
        if (!cancelled) setSessions(page.sessions);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [exercise.id]);

  if (sessions === null) {
    return <div className="h-[180px] animate-pulse rounded-xl bg-surface" aria-busy="true" />;
  }

  let series: TrendPoint[];
  let title: string;
  let note: string | undefined;

  // Chart selection is driven by the exercise's progression_metric — a lateral
  // raise (volume) never gets a meaningless 1RM curve. reps_at_load has no chart
  // of its own yet, so it falls back to the always-meaningful volume trend.
  if (exercise.progression_metric === "e1rm") {
    series = toE1rmSeries(sessions);
    title = "Estimated 1RM (Epley)";
    note = "An estimate from your working sets, not a tested max.";
  } else if (exercise.progression_metric === "top_weight") {
    series = toTopWeightSeries(sessions);
    title = "Top working weight";
  } else {
    series = toVolumeSeries(sessions);
    title = "Session volume";
  }

  if (series.length < MIN_POINTS) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        Not enough sessions yet to chart {title.toLowerCase()}.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {note && <p className="text-xs text-muted">{note}</p>}
      <TrendLineChart data={series} />
    </div>
  );
}
