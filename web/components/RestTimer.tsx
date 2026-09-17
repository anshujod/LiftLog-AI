"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_SECONDS = 90;
const STORAGE_KEY = "liftlog:restTimerSeconds";

function loadDefaultSeconds(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SECONDS;
  } catch {
    return DEFAULT_SECONDS;
  }
}

function saveDefaultSeconds(seconds: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(seconds));
  } catch {
    // best-effort — losing the saved default just falls back to 90s next time
  }
}

function playBeep(context: AudioContext): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.2, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.4);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.4);
}

/** Mount this with a `key` that changes every time a set is saved — remounting
 * is what (re)starts the countdown, rather than resetting state from an effect
 * on a changing prop. */
export function RestTimer({ onDismiss }: { onDismiss?: () => void }) {
  const [defaultSeconds, setDefaultSeconds] = useState<number>(loadDefaultSeconds);
  const [remaining, setRemaining] = useState<number>(defaultSeconds);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const firedRef = useRef(false);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isDone = remaining <= 0;
  const progress = Math.min(1, Math.max(0, remaining / defaultSeconds));

  useEffect(() => {
    try {
      if (!audioCtxRef.current && typeof AudioContext !== "undefined") {
        audioCtxRef.current = new AudioContext();
      }
      void audioCtxRef.current?.resume();
    } catch {
      // audio unsupported or blocked — the visible countdown still works
    }
    return () => {
      try {
        void audioCtxRef.current?.close();
      } catch {
        // never throw from unmount cleanup
      }
      audioCtxRef.current = null;
    };
  }, []);

  // Mirror the countdown into the tab title so a glance at the tab (or a
  // phone left on the floor) shows the remaining rest.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.title;
    if (remaining > 0) {
      document.title = `(${minutes}:${String(seconds).padStart(2, "0")}) LiftLog`;
    }
    return () => {
      document.title = previous;
    };
  }, [remaining, minutes, seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(300);
        if (audioCtxRef.current) playBeep(audioCtxRef.current);
      }
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  function adjust(deltaSeconds: number) {
    const next = Math.max(15, defaultSeconds + deltaSeconds);
    setDefaultSeconds(next);
    saveDefaultSeconds(next);
    // Never let −15 auto-trigger the done fanfare from a button press:
    // clamping at 1s means the beep only fires when the countdown itself
    // reaches zero. There is an explicit dismiss for skipping.
    setRemaining((r) => (r <= 0 ? 0 : Math.max(1, r + deltaSeconds)));
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-[2px] px-4 py-3 ${
        isDone ? "bg-acid text-background" : "bg-surface"
      } border hairline`}
      role="timer"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <span
            className={`text-[11px] font-bold uppercase tracking-[0.18em] ${
              isDone ? "text-background/70" : "text-muted"
            }`}
          >
            {isDone ? "Go" : "Rest"}
          </span>
          <span
            className={`numeral-giant text-[44px] leading-none ${
              isDone ? "text-background" : "text-foreground"
            }`}
          >
            {minutes}:{String(seconds).padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => adjust(-15)}
            className={`flex h-11 min-w-12 shrink-0 items-center justify-center px-3 text-xs font-bold ${
              isDone ? "text-background/70" : "text-muted"
            }`}
            aria-label="Subtract 15 seconds"
          >
            −15
          </button>
          <button
            type="button"
            onClick={() => adjust(15)}
            className={`flex h-11 min-w-12 shrink-0 items-center justify-center px-3 text-xs font-bold ${
              isDone ? "text-background/70" : "text-muted"
            }`}
            aria-label="Add 15 seconds"
          >
            +15
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className={`flex h-11 w-10 shrink-0 items-center justify-center text-base ${
                isDone ? "text-background" : "text-faint"
              }`}
              aria-label="Dismiss rest timer"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className={`h-[3px] overflow-hidden ${isDone ? "bg-background/20" : "bg-sunken"}`} aria-hidden="true">
        <div
          className={`h-full transition-[width] duration-1000 ${isDone ? "bg-background" : "bg-acid"}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}
