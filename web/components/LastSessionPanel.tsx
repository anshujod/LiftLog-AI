"use client";

import { useEffect, useState } from "react";
import { getLastSession, type LastSession } from "@/lib/api/exercises";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";
import { ApiError } from "@/lib/api/errors";

interface LastSessionPanelProps {
  exerciseId: string;
}

/**
 * If exerciseId can change on an already-mounted instance (e.g. swapping the
 * exercise mid-workout), pass `key={exerciseId}` at the call site so the fetch
 * state resets via remount instead of a stale "ready" panel lingering mid-fetch.
 */

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: LastSession };

export function LastSessionPanel({ exerciseId }: LastSessionPanelProps) {
  const [state, setState] = useState<PanelState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    getLastSession(exerciseId)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof ApiError ? err.message : "Couldn't load last session",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  if (state.status === "loading") {
    return (
      <div
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
        aria-busy="true"
        aria-label="Loading last session"
      >
        <div className="h-4 w-32 animate-pulse rounded bg-surface-raised" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-raised" />
        <div className="h-8 w-full animate-pulse rounded bg-surface-raised" />
        <div className="h-4 w-40 animate-pulse rounded bg-surface-raised" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-danger" role="alert">
        {state.message}
      </div>
    );
  }

  const { data } = state;

  if (!data.has_data || !data.session) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4">
        <p className="font-medium">First time logging this one?</p>
        <p className="text-sm text-muted">
          Log a set and this panel will show exactly what you did, every time after.
        </p>
      </div>
    );
  }

  const { session, bests } = data;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{formatRelativeDate(session.performed_on)}</span>
        <span className="text-sm text-muted">{formatAbsoluteDate(session.performed_on)}</span>
      </div>

      <ul className="flex flex-col gap-2">
        {session.sets.map((set) =>
          set.is_warmup ? (
            <li key={set.id} className="flex items-baseline gap-2 text-muted">
              <span className="text-xs font-medium uppercase tracking-wide">Warmup</span>
              <span className="tabular-nums text-base">
                {set.load.display} × {set.reps}
              </span>
            </li>
          ) : (
            <li key={set.id} className="tabular-nums text-2xl font-semibold">
              {set.load.display} × {set.reps}
            </li>
          )
        )}
      </ul>

      {(bests.weight_pr || bests.e1rm_pr) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
          {bests.weight_pr && (
            <div>
              <span className="text-muted">Personal best </span>
              <span className="tabular-nums font-medium">
                {bests.weight_pr.load.display} × {bests.weight_pr.reps}
              </span>
            </div>
          )}
          {bests.e1rm_pr && (
            <div>
              <span className="text-muted">Est. 1RM </span>
              <span className="tabular-nums font-medium">{bests.e1rm_pr.estimated_1rm.display}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
