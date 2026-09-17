"use client";

import { useEffect, useState } from "react";
import { getDashboard } from "@/lib/api/analytics";
import { getMuscleGroupVolume } from "@/lib/api/analytics";

export interface CoachInsight {
  title: string;
  detail: string;
  question: string;
}

function pushPullShare(
  groups: { muscle_group_slug: string; volume: { grams: number } }[]
): { push: number; pull: number; legs: number } {
  const total = groups.reduce((n, g) => n + g.volume.grams, 0);
  if (total <= 0) return { push: 0, pull: 0, legs: 0 };
  const sum = (slugs: string[]) =>
    groups.filter((g) => slugs.includes(g.muscle_group_slug)).reduce((n, g) => n + g.volume.grams, 0) /
    total;
  return {
    push: sum(["chest", "shoulders", "triceps"]),
    pull: sum(["back", "biceps"]),
    legs: sum(["legs"]),
  };
}

export function useCoachInsights(): {
  insights: CoachInsight[] | null;
  failed: boolean;
  retry: () => void;
} {
  const [insights, setInsights] = useState<CoachInsight[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Reset happens in retry() and via the null initial state — never synchronously here.
    Promise.all([getDashboard(), getMuscleGroupVolume("30d")])
      .then(([d, groups]) => {
        if (cancelled) return;
        const cards: CoachInsight[] = [];
        const top = d.top_improving_exercises[0];
        if (top) {
          cards.push({
            title: top.exercise_name,
            detail: `Volume up ${top.percent_change}% — your fastest mover.`,
            question: `How much has my ${top.exercise_name.toLowerCase()} improved?`,
          });
        }
        const share = pushPullShare(groups);
        const total = share.push + share.pull + share.legs;
        if (total > 0) {
          const pushPct = Math.round(share.push * 100);
          const lean =
            share.push >= 0.6
              ? "push-focused"
              : share.legs <= 0.15
                ? "light on legs"
                : "fairly balanced";
          cards.push({
            title: "Training balance",
            detail: `${pushPct}% of volume is push — ${lean}.`,
            question: "Which muscle groups am I training most?",
          });
        }
        const byDate = [...groups]
          .filter((g) => g.working_set_count > 0 && g.last_trained_on)
          .sort((a, b) => (a.last_trained_on! < b.last_trained_on! ? -1 : 1));
        const stalest = groups
          .filter((g) => (g.working_set_count ?? 0) === 0 || !g.last_trained_on)
          .map((g) => g.muscle_group_name)[0];
        if (stalest) {
          cards.push({
            title: "Recovery",
            detail: `${stalest} hasn't been trained in the last 30 days.`,
            question: `When did I last train ${stalest.toLowerCase()}?`,
          });
        } else if (byDate[0]?.last_trained_on) {
          const days = Math.max(
            0,
            Math.round(
              (Date.now() - new Date(`${byDate[0].last_trained_on}T00:00:00`).getTime()) / 86400000
            )
          );
          if (days >= 7) {
            cards.push({
              title: "Recovery",
              detail: `${byDate[0].muscle_group_name} last trained ${days} days ago.`,
              question: `When did I last train ${byDate[0].muscle_group_name.toLowerCase()}?`,
            });
          }
        }
        if (cards.length === 0) {
          cards.push({
            title: "Not enough data yet",
            detail: "Log a few sessions and insights appear here.",
            question: "What should I focus on this week?",
          });
        }
        setInsights(cards.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) {
          setInsights([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  function retry() {
    setInsights(null);
    setFailed(false);
    setNonce((n) => n + 1);
  }

  return { insights, failed, retry };
}
