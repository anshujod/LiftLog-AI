"use client";

import { useEffect, useRef, useState } from "react";
import { LastSessionPanel } from "@/components/LastSessionPanel";
import { SetRow, type SetRowValues } from "@/components/SetRow";
import { SuggestionCard } from "@/components/SuggestionCard";
import type { DisplayExercise } from "@/hooks/useActiveWorkout";
import { gToUnitValue, type Unit } from "@/lib/units";

interface WorkoutExerciseCardProps {
  displayExercise: DisplayExercise;
  unit: Unit;
  onLogSet: (values: SetRowValues) => void;
  onUpdateSet: (clientId: string, values: SetRowValues) => void;
  onDeleteSet: (clientId: string) => void;
  onRemoveExercise: () => void;
}

function draftDefaults(displayExercise: DisplayExercise): SetRowValues {
  const { sets, lastSessionSets } = displayExercise;
  const index = sets.length;
  const fromLastSession = lastSessionSets[index];
  if (fromLastSession) return { ...fromLastSession, is_warmup: false };
  if (sets.length > 0) {
    const last = sets[sets.length - 1];
    return { load_g: last.load_g, reps: last.reps, is_warmup: false };
  }
  if (lastSessionSets.length > 0) {
    const last = lastSessionSets[lastSessionSets.length - 1];
    return { ...last, is_warmup: false };
  }
  return { load_g: 0, reps: 8, is_warmup: false };
}

export function WorkoutExerciseCard({
  displayExercise,
  unit,
  onLogSet,
  onUpdateSet,
  onDeleteSet,
  onRemoveExercise,
}: WorkoutExerciseCardProps) {
  const [showLastSession, setShowLastSession] = useState(false);
  // Two-tap remove: first tap arms, second confirms. Same gym-proofing as
  // the set-row delete.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { exercise, sets } = displayExercise;
  const lastLoggedSet = sets[sets.length - 1];

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  function handleRemovePress() {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmingRemove(false), 3000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmingRemove(false);
    onRemoveExercise();
  }

  const workingSets = sets.filter((s) => !s.is_warmup);
  const topSet = workingSets.reduce<{ load_g: number; reps: number } | null>(
    (best, s) => (!best || s.load_g > best.load_g ? { load_g: s.load_g, reps: s.reps } : best),
    null
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowLastSession((v) => !v)}
          aria-expanded={showLastSession}
          className="flex min-h-11 min-w-0 flex-1 items-center text-left text-lg font-semibold"
        >
          <span className="truncate">{exercise.name}</span>
        </button>
        <button
          type="button"
          onClick={handleRemovePress}
          className={`flex h-11 shrink-0 items-center justify-center rounded-lg leading-none ${
            confirmingRemove
              ? "bg-danger/15 px-3 text-sm font-medium text-danger"
              : "w-11 text-lg text-muted"
          }`}
          aria-label={
            confirmingRemove
              ? `Confirm remove ${exercise.name} from this workout`
              : `Remove ${exercise.name} from this workout`
          }
        >
          {confirmingRemove ? "Sure?" : "×"}
        </button>
      </div>
      {topSet && (
        <p className="tabular-nums text-xs text-muted" aria-label="Session summary">
          {workingSets.length} working · top {formatLoadValue(topSet.load_g, unit)}
          {unit} × {topSet.reps}
        </p>
      )}

      {showLastSession && <LastSessionPanel exerciseId={exercise.id} />}

      <SuggestionCard exerciseId={exercise.id} exerciseName={exercise.name} />

      <div className="flex flex-col divide-y divide-border">
        {sets.map((set) => (
          <SetRow
            key={set.clientId}
            unit={unit}
            incrementG={exercise.default_increment_g}
            mode="logged"
            syncStatus={set.syncStatus}
            initial={{ load_g: set.load_g, reps: set.reps, is_warmup: set.is_warmup }}
            onChange={(values) => onUpdateSet(set.clientId, values)}
            onDelete={() => onDeleteSet(set.clientId)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-60 flex-1">
          <SetRow
            key={`draft-${sets.length}`}
            unit={unit}
            incrementG={exercise.default_increment_g}
            mode="draft"
            initial={draftDefaults(displayExercise)}
            onSave={onLogSet}
          />
        </div>
        {lastLoggedSet && (
          <button
            type="button"
            onClick={() =>
              onLogSet({ load_g: lastLoggedSet.load_g, reps: lastLoggedSet.reps, is_warmup: false })
            }
            className="flex h-11 shrink-0 items-center rounded-lg border border-border px-4 text-sm text-muted"
          >
            Repeat
          </button>
        )}
      </div>
    </div>
  );
}

function formatLoadValue(loadG: number, unit: Unit): string {
  const value = gToUnitValue(loadG, unit);
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}
