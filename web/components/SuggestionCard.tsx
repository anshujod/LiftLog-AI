"use client";

import { useState } from "react";
import { workoutRecommendation, type WorkoutRecommendation } from "@/lib/api/ai";
import { Button } from "@/components/ui/Button";

export function SuggestionCard({ exerciseId, exerciseName }: { exerciseId: string; exerciseName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<WorkoutRecommendation | null>(null);
  const [error, setError] = useState(false);
  const panelId = `suggestion-panel-${exerciseId}`;

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
        aria-expanded={false}
        aria-controls={panelId}
        className="min-h-[44px] self-start text-xs font-bold uppercase tracking-[0.14em] text-muted underline decoration-faint underline-offset-4"
      >
        + Coach suggests
      </button>
    );
  }

  return (
    <div id={panelId} className="flex flex-col gap-2 rounded-[2px] border-l-2 border-acid bg-surface p-3">
      <div className="flex items-center justify-between">
        <p className="eyebrow">
          Coach — Suggested
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss suggestion"
          className="flex h-11 w-11 items-center justify-center rounded-[2px] text-base leading-none text-faint"
        >
          ×
        </button>
      </div>
      {loading && <div className="h-14 animate-pulse rounded-[2px] bg-surface-raised" aria-busy="true" />}
      {!loading && error && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-muted">Suggestion unavailable right now.</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}
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
          <p className="text-xs text-faint">A suggestion, not instruction.</p>
        </>
      )}
    </div>
  );
}
