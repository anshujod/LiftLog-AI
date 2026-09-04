"use client";

import { useState } from "react";
import { gToUnitValue, unitToG, type Unit } from "@/lib/units";

export interface SetRowValues {
  load_g: number;
  reps: number;
  is_warmup: boolean;
}

interface SetRowProps {
  unit: Unit;
  incrementG: number;
  initial: SetRowValues;
  mode: "draft" | "logged";
  syncStatus?: "synced" | "pending";
  onSave?: (values: SetRowValues) => void;
  onChange?: (values: SetRowValues) => void;
  onDelete?: () => void;
}

function formatValue(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export function SetRow({ unit, incrementG, initial, mode, syncStatus, onSave, onChange, onDelete }: SetRowProps) {
  const [loadG, setLoadG] = useState(initial.load_g);
  const [loadText, setLoadText] = useState(formatValue(gToUnitValue(initial.load_g, unit)));
  const [reps, setReps] = useState(initial.reps);
  const [repsText, setRepsText] = useState(String(initial.reps));
  const [isWarmup, setIsWarmup] = useState(initial.is_warmup);

  function commit(next: Partial<SetRowValues>) {
    const values: SetRowValues = {
      load_g: next.load_g ?? loadG,
      reps: next.reps ?? reps,
      is_warmup: next.is_warmup ?? isWarmup,
    };
    if (mode === "logged") onChange?.(values);
  }

  function commitLoadText() {
    const parsed = parseFloat(loadText);
    const grams = Number.isFinite(parsed) && parsed > 0 ? unitToG(parsed, unit) : loadG;
    setLoadG(grams);
    setLoadText(formatValue(gToUnitValue(grams, unit)));
    commit({ load_g: grams });
  }

  function commitRepsText() {
    const parsed = parseInt(repsText, 10);
    const nextReps = Number.isFinite(parsed) && parsed > 0 ? parsed : reps;
    setReps(nextReps);
    setRepsText(String(nextReps));
    commit({ reps: nextReps });
  }

  function step(deltaG: number) {
    const nextGrams = Math.max(0, loadG + deltaG);
    setLoadG(nextGrams);
    setLoadText(formatValue(gToUnitValue(nextGrams, unit)));
    commit({ load_g: nextGrams });
  }

  function toggleWarmup() {
    const next = !isWarmup;
    setIsWarmup(next);
    commit({ is_warmup: next });
  }

  function handleLogSet() {
    onSave?.({ load_g: loadG, reps, is_warmup: isWarmup });
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={toggleWarmup}
        aria-pressed={isWarmup}
        className={`h-9 shrink-0 rounded-lg border px-2 text-[11px] font-medium uppercase tracking-wide ${
          isWarmup ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
        }`}
      >
        W
      </button>

      <div className="flex flex-1 items-center gap-1">
        <button
          type="button"
          onClick={() => step(-incrementG)}
          className="h-9 w-9 shrink-0 rounded-lg border border-border text-lg leading-none text-muted"
          aria-label={`Decrease by ${gToUnitValue(incrementG, unit)} ${unit}`}
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={loadText}
          onChange={(e) => setLoadText(e.target.value)}
          onBlur={commitLoadText}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-9 w-16 rounded-lg border border-border bg-surface text-center text-base tabular-nums outline-none focus:border-accent"
          aria-label={`Load in ${unit}`}
        />
        <button
          type="button"
          onClick={() => step(incrementG)}
          className="h-9 w-9 shrink-0 rounded-lg border border-border text-lg leading-none text-muted"
          aria-label={`Increase by ${gToUnitValue(incrementG, unit)} ${unit}`}
        >
          +
        </button>
      </div>

      <span className="text-muted">×</span>

      <input
        type="text"
        inputMode="numeric"
        value={repsText}
        onChange={(e) => setRepsText(e.target.value)}
        onBlur={commitRepsText}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-9 w-14 shrink-0 rounded-lg border border-border bg-surface text-center text-base tabular-nums outline-none focus:border-accent"
        aria-label="Reps"
      />

      {mode === "draft" ? (
        <button
          type="button"
          onClick={handleLogSet}
          className="h-9 shrink-0 rounded-lg bg-accent px-3 text-sm font-medium text-white"
        >
          Log
        </button>
      ) : (
        <>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${syncStatus === "pending" ? "animate-pulse bg-muted" : "bg-success"}`}
            aria-label={syncStatus === "pending" ? "Syncing" : "Saved"}
          />
          <button
            type="button"
            onClick={onDelete}
            className="h-9 w-9 shrink-0 rounded-lg text-lg leading-none text-danger"
            aria-label="Delete set"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
