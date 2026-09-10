"use client";

import { useState } from "react";
import type { Exercise } from "@/lib/api/exercises";
import { gToUnitValue, unitToG, type Unit } from "@/lib/units";
import type { VoiceLogCommand } from "@/lib/voice/parse";

export interface VoiceConfirmValues {
  exerciseId: string;
  loadG: number;
  reps: number;
  sets: number;
  isWarmup: boolean;
}

interface VoiceConfirmSheetProps {
  command: VoiceLogCommand;
  library: Exercise[];
  unit: Unit;
  onConfirm: (values: VoiceConfirmValues) => Promise<void>;
  onClose: () => void;
}

function formatLoadValue(loadG: number, unit: Unit): string {
  const value = gToUnitValue(loadG, unit);
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function loadHint(exercise: Exercise | undefined): string | null {
  if (!exercise) return null;
  switch (exercise.load_type) {
    case "dumbbell_per_hand":
      return "Per-hand weight — volume counts both sides.";
    case "bodyweight":
      return "Bodyweight exercise — no load needed.";
    case "bodyweight_added":
      return "Extra weight on top of bodyweight.";
    case "assisted":
      return "Assistance weight — subtracted from bodyweight.";
    default:
      return null;
  }
}

/**
 * Confirm-before-save for voice logging. Speech recognition mishears numbers,
 * so parsed values are shown (and editable) and nothing reaches the sync
 * queue until Confirm. Load-type rules (bodyweight = 0, assisted = negative)
 * are applied here; the server's 422 validation remains the backstop.
 */
export function VoiceConfirmSheet({ command, library, unit, onConfirm, onClose }: VoiceConfirmSheetProps) {
  const [exerciseId, setExerciseId] = useState<string | null>(command.exerciseId);
  const [loadText, setLoadText] = useState(command.loadG === null ? "" : formatLoadValue(command.loadG, unit));
  const [repsText, setRepsText] = useState(command.reps === null ? "" : String(command.reps));
  const [setsText, setSetsText] = useState(String(command.sets));
  const [isWarmup, setIsWarmup] = useState(command.isWarmup);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const exercise = exerciseId ? (library.find((e) => e.id === exerciseId) ?? null) : null;
  const candidates = command.candidates
    .map((c) => library.find((e) => e.id === c.id))
    .filter((e): e is Exercise => e !== undefined);
  const hint = loadHint(exercise ?? undefined);
  const isBodyweight = exercise?.load_type === "bodyweight";

  async function handleConfirm() {
    if (exerciseId === null || exercise === null) {
      setError("Pick which exercise this was.");
      return;
    }
    const reps = parseInt(repsText, 10);
    if (!Number.isFinite(reps) || reps < 1) {
      setError("Reps must be at least 1.");
      return;
    }
    const sets = parseInt(setsText, 10);
    if (!Number.isFinite(sets) || sets < 1) {
      setError("Sets must be at least 1.");
      return;
    }
    let loadG: number;
    if (isBodyweight) {
      loadG = 0;
    } else {
      const loadValue = parseFloat(loadText);
      if (!Number.isFinite(loadValue) || loadValue <= 0) {
        setError("Enter a weight above 0.");
        return;
      }
      const grams = unitToG(loadValue, unit);
      loadG = exercise.load_type === "assisted" ? -grams : grams;
    }

    setError(null);
    setConfirming(true);
    try {
      await onConfirm({ exerciseId, loadG, reps, sets, isWarmup });
    } catch {
      setError("Couldn't log those sets — check your connection and try again.");
      setConfirming(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm voice-logged sets"
    >
      <div className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-background p-4 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Log these sets?</h2>
          <button type="button" onClick={onClose} disabled={confirming} className="text-sm text-muted">
            Cancel
          </button>
        </div>

        <p className="text-sm text-muted" aria-label="Heard transcript">
          Heard: “{command.transcript}”
        </p>

        {command.confidence === "low" && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="alert">
            Check the numbers — voice mishears. Nothing is saved until you confirm.
          </p>
        )}

        {exerciseId === null && candidates.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Which exercise did you mean?</p>
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setExerciseId(candidate.id)}
                className="h-12 rounded-lg border border-border px-4 text-left text-sm font-medium"
              >
                {candidate.name}
              </button>
            ))}
          </div>
        )}

        {exercise && (
          <>
            <p className="text-base font-medium" aria-live="polite">
              {exercise.name}
              {command.sets > 1 || setsText !== "1" ? ` · ${setsText} set${setsText === "1" ? "" : "s"}` : ""}
            </p>
            {hint && <p className="text-xs text-muted">{hint}</p>}

            {!isBodyweight && (
              <label className="flex flex-col gap-1 text-sm text-muted">
                Weight ({unit}{exercise.load_type === "dumbbell_per_hand" ? ", per hand" : ""})
                <input
                  value={loadText}
                  onChange={(e) => setLoadText(e.target.value)}
                  inputMode="decimal"
                  aria-label={`Weight in ${unit}`}
                  className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
                />
              </label>
            )}

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
                Reps
                <input
                  value={repsText}
                  onChange={(e) => setRepsText(e.target.value)}
                  inputMode="numeric"
                  aria-label="Reps"
                  className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-muted">
                Sets
                <input
                  value={setsText}
                  onChange={(e) => setSetsText(e.target.value)}
                  inputMode="numeric"
                  aria-label="Sets"
                  className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isWarmup}
                onChange={(e) => setIsWarmup(e.target.checked)}
                className="h-5 w-5"
              />
              Warmup set (excluded from PRs and trends)
            </label>
          </>
        )}

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={confirming}
          className="h-14 rounded-lg bg-accent text-lg font-medium text-white disabled:opacity-50"
        >
          {confirming ? "Logging…" : "Confirm and log"}
        </button>
      </div>
    </div>
  );
}
