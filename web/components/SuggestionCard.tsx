"use client";

import { useState } from "react";
import { workoutRecommendation, type WorkoutRecommendation } from "@/lib/api/ai";

export function SuggestionCard({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<WorkoutRecommendation | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError(false);
    try {
      setSuggestion(await workoutRecommendation(exerciseId));
    } catch {
      // Any failure (including an exercise that vanished) degrades to a quiet note.
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function dismiss() {
    setOpen(false);
    setSuggestion(null);
    setError(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => void load()}
        className="self-start rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-accent"
      >
        Suggest sets
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-surface p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Suggested for {exerciseName}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss suggestion"
          className="h-7 w-7 rounded-lg text-base leading-none text-muted"
        >
          ×
        </button>
      </div>
      {loading && <div className="h-14 animate-pulse rounded-lg bg-surface-raised" aria-busy="true" />}
      {!loading && error && <p className="text-xs text-muted">Suggestion unavailable right now.</p>}
      {!loading && !error && suggestion && suggestion.suggested_sets.length === 0 && (
        <p className="text-xs text-muted">
          Log {exerciseName} first — a recent working set is needed before suggesting loads.
        </p>
      )}
      {!loading && !error && suggestion && suggestion.suggested_sets.length > 0 && (
        <>
          <ul className="flex flex-col gap-1">
            {suggestion.suggested_sets.map((set, index) => (
              <li key={index} className="tabular-nums text-sm">
                Set {index + 1}: {set.load.display} × {set.reps}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{suggestion.explanation}</p>
          <p className="text-xs text-muted">A suggestion, not instruction.</p>
        </>
      )}
    </div>
  );
}
