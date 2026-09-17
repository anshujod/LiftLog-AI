"use client";

import { useEffect, useRef, useState } from "react";
import { LastSessionPanel } from "@/components/LastSessionPanel";
import { SetRow, type SetRowValues } from "@/components/SetRow";
import { SuggestionCard } from "@/components/SuggestionCard";
import type { DisplayExercise } from "@/hooks/useActiveWorkout";
import { gToUnitValue, type Unit } from "@/lib/units";

interface WorkoutExerciseCardProps {
  displayExercise: DisplayExercise;
  index: number;
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
  index,
  unit,
  onLogSet,
  onUpdateSet,
  onDeleteSet,
  onRemoveExercise,
}: WorkoutExerciseCardProps) {
  const [showLastSession, setShowLastSession] = useState(false);
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
    <section className="flex flex-col gap-2 border-t-2 border-foreground/80 pt-4" aria-label={exercise.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-display text-lg text-acid" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => setShowLastSession((v) => !v)}
            aria-expanded={showLastSession}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-[22px] font-semibold tracking-tight">
              {exercise.name}
            </span>
            <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
              {workingSets.length} SETS
              {topSet
                ? ` · TOP ${formatLoadValue(topSet.load_g, unit)}${unit} × ${topSet.reps}`
                : " · NO SETS YET"}{" "}
              · <span className="underline underline-offset-4">{showLastSession ? "Hide last" : "Last"}</span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleRemovePress}
          className={`flex h-11 shrink-0 items-center justify-center rounded-[2px] leading-none ${
            confirmingRemove
              ? "bg-danger/15 px-3 text-sm font-medium text-danger"
              : "w-10 text-xl text-faint"
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

      {showLastSession && (
        <div className="border-l-2 border-acid/60 pl-3">
          <LastSessionPanel exerciseId={exercise.id} />
        </div>
      )}

      <SuggestionCard exerciseId={exercise.id} exerciseName={exercise.name} />

      <div className="flex flex-col">
        {sets.map((set, i) => (
          <div key={set.clientId} className="flex items-center gap-2 border-b hairline">
            <span className="w-6 shrink-0 tabular-nums text-xs text-faint">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <SetRow
                unit={unit}
                incrementG={exercise.default_increment_g}
                mode="logged"
                syncStatus={set.syncStatus}
                initial={{ load_g: set.load_g, reps: set.reps, is_warmup: set.is_warmup }}
                onChange={(values) => onUpdateSet(set.clientId, values)}
                onDelete={() => onDeleteSet(set.clientId)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 bg-sunken/60 p-2">
        <p className="eyebrow px-1">Current set — {workingSets.length + 1}</p>
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
              className="flex h-14 shrink-0 items-center rounded-[2px] border hairline px-4 text-xs font-bold uppercase tracking-[0.12em] text-muted"
            >
              Repeat
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function formatLoadValue(loadG: number, unit: Unit): string {
  const value = gToUnitValue(loadG, unit);
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}
