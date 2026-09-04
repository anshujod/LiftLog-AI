"use client";

import { useState } from "react";
import { LastSessionPanel } from "@/components/LastSessionPanel";
import { SetRow, type SetRowValues } from "@/components/SetRow";
import type { DisplayExercise } from "@/hooks/useActiveWorkout";
import type { Unit } from "@/lib/units";

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
  const { exercise, sets } = displayExercise;
  const lastLoggedSet = sets[sets.length - 1];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowLastSession((v) => !v)}
          className="flex-1 text-left text-lg font-semibold"
        >
          {exercise.name}
        </button>
        <button
          type="button"
          onClick={onRemoveExercise}
          className="h-9 w-9 shrink-0 rounded-lg text-lg leading-none text-muted"
          aria-label={`Remove ${exercise.name} from this workout`}
        >
          ×
        </button>
      </div>

      {showLastSession && <LastSessionPanel exerciseId={exercise.id} />}

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

      <div className="flex items-center gap-2">
        <div className="flex-1">
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
            className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs text-muted"
          >
            Repeat
          </button>
        )}
      </div>
    </div>
  );
}
