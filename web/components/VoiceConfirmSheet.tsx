"use client";

import { useState } from "react";
import type { Exercise } from "@/lib/api/exercises";
import { gToUnitValue, unitToG, type Unit } from "@/lib/units";
import type { VoiceLogCommand } from "@/lib/voice/parse";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Sheet } from "@/components/ui/Sheet";

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
    <Sheet title="Log these sets?" onClose={onClose} tall>
        <p className="text-sm text-muted">
          Heard: <span aria-label="Heard transcript">“{command.transcript}”</span>
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
                className="flex min-h-12 items-center rounded-lg border border-border px-4 text-left text-sm font-medium"
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
              <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="voice-weight">
                Weight ({unit}{exercise.load_type === "dumbbell_per_hand" ? ", per hand" : ""})
                <input
                  id="voice-weight"
                  name="voice-weight"
                  value={loadText}
                  onChange={(e) => setLoadText(e.target.value)}
                  inputMode="decimal"
                  enterKeyHint="next"
                  aria-label={`Weight in ${unit}`}
                  className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
                />
              </label>
            )}

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm text-muted" htmlFor="voice-reps">
                Reps
                <input
                  id="voice-reps"
                  name="voice-reps"
                  value={repsText}
                  onChange={(e) => setRepsText(e.target.value)}
                  inputMode="numeric"
                  enterKeyHint="next"
                  aria-label="Reps"
                  className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-muted" htmlFor="voice-sets">
                Sets
                <input
                  id="voice-sets"
                  name="voice-sets"
                  value={setsText}
                  onChange={(e) => setSetsText(e.target.value)}
                  inputMode="numeric"
                  enterKeyHint="done"
                  aria-label="Sets"
                  className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor="voice-warmup">
              <input
                id="voice-warmup"
                name="voice-warmup"
                type="checkbox"
                checked={isWarmup}
                onChange={(e) => setIsWarmup(e.target.checked)}
                className="h-5 w-5 shrink-0 accent-[var(--color-accent)]"
              />
              Warmup set (excluded from PRs and trends)
            </label>
          </>
        )}

        {error && <ErrorNote message={error} />}

        <Button
          type="button"
          variant="primary"
          size="md"
          className="h-14 w-full text-lg"
          loading={confirming}
          loadingLabel="Logging…"
          onClick={() => void handleConfirm()}
        >
          Confirm and log
        </Button>
    </Sheet>
  );
}
