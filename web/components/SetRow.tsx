"use client";

import { useEffect, useRef, useState } from "react";
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

const NUMERAL_CLASSES =
  "h-14 rounded-[2px] border border-transparent bg-sunken text-center font-display text-2xl tracking-wide tabular-nums outline-none focus:border-acid";

export function SetRow({ unit, incrementG, initial, mode, syncStatus, onSave, onChange, onDelete }: SetRowProps) {
  const [loadG, setLoadG] = useState(initial.load_g);
  const [loadText, setLoadText] = useState(formatValue(gToUnitValue(initial.load_g, unit)));
  const [reps, setReps] = useState(initial.reps);
  const [repsText, setRepsText] = useState(String(initial.reps));
  const [isWarmup, setIsWarmup] = useState(initial.is_warmup);
  // Two-tap delete: first tap arms, second confirms. Gym-proof against
  // chalky mistaps without a blocking modal.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const repsInputRef = useRef<HTMLInputElement>(null);
  const stepDisplay = formatValue(gToUnitValue(incrementG, unit));

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

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
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(50);
    } catch {
      // haptics are a nicety — logging must never depend on them
    }
    onSave?.({ load_g: loadG, reps, is_warmup: isWarmup });
  }

  function handleDeletePress() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(false);
    onDelete?.();
  }

  return (
    <div className={`flex items-center gap-1.5 py-1.5 ${mode === "draft" ? "animate-log-flash" : ""}`}>
      <button
        type="button"
        onClick={toggleWarmup}
        aria-pressed={isWarmup}
        title="Warmup set"
        className={`h-14 w-11 shrink-0 rounded-[2px] border text-xs font-bold uppercase tracking-[0.12em] ${
          isWarmup ? "border-acid bg-acid/10 text-acid" : "hairline text-faint"
        }`}
      >
        W
      </button>

      <div className="flex min-w-0 flex-1 items-center">
        <button
          type="button"
          onClick={() => step(-incrementG)}
          className="flex h-14 w-10 shrink-0 flex-col items-center justify-center leading-none text-muted"
          aria-label={`Decrease by ${gToUnitValue(incrementG, unit)} ${unit}`}
        >
          <span className="text-2xl">−</span>
          <span className="tabular-nums text-[10px] text-faint">{stepDisplay}</span>
        </button>
        <input
          ref={loadInputRef}
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          value={loadText}
          onChange={(e) => setLoadText(e.target.value)}
          onBlur={commitLoadText}
          onKeyDown={(e) => {
            if (e.key === "Enter") repsInputRef.current?.focus();
          }}
          className={`${NUMERAL_CLASSES} w-[76px] min-w-0 flex-1`}
          aria-label={`Load in ${unit}`}
        />
        <button
          type="button"
          onClick={() => step(incrementG)}
          className="flex h-14 w-10 shrink-0 flex-col items-center justify-center leading-none text-muted"
          aria-label={`Increase by ${gToUnitValue(incrementG, unit)} ${unit}`}
        >
          <span className="text-2xl">+</span>
          <span className="tabular-nums text-[10px] text-faint">{stepDisplay}</span>
        </button>
      </div>

      <span className="shrink-0 font-display text-lg text-faint" aria-hidden="true">
        ×
      </span>

      <input
        ref={repsInputRef}
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        value={repsText}
        onChange={(e) => setRepsText(e.target.value)}
        onBlur={commitRepsText}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${NUMERAL_CLASSES} w-[72px] shrink-0`}
        aria-label="Reps"
      />

      {mode === "draft" ? (
        <button
          type="button"
          onClick={handleLogSet}
          className="slab-press h-14 shrink-0 rounded-[2px] bg-acid px-6 font-display text-lg tracking-wide text-background"
        >
          Log
        </button>
      ) : (
        <>
          <span
            className={`h-1.5 w-1.5 shrink-0 ${syncStatus === "pending" ? "animate-pulse bg-muted" : "bg-acid"}`}
            aria-label={syncStatus === "pending" ? "Syncing" : "Saved"}
          />
          <button
            type="button"
            onClick={handleDeletePress}
            className={`flex h-14 shrink-0 items-center justify-center rounded-[2px] leading-none ${
              confirmingDelete ? "bg-danger/15 px-3 text-sm font-medium text-danger" : "w-10 text-xl text-faint"
            }`}
            aria-label={confirmingDelete ? "Confirm delete" : "Delete set"}
          >
            {confirmingDelete ? "Sure?" : "×"}
          </button>
        </>
      )}
    </div>
  );
}
