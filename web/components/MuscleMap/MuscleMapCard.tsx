"use client";

import { useCallback, useEffect, useState } from "react";
import { getMuscleGroupVolume, type MuscleGroupVolume, type Period } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/errors";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Button } from "@/components/ui/Button";
import { BodyweightErrorAction } from "@/components/BodyweightErrorAction";
import { isBodyweightRequired, onBodyweightSaved } from "@/lib/api/bodyweight-events";
import { MuscleMap } from "./MuscleMap";

type MapPeriod = Extract<Period, "7d" | "30d">;

const PERIOD_LABEL: Record<MapPeriod, string> = {
  "7d": "past week",
  "30d": "past 30 days",
};

export function MuscleMapCard() {
  const [period, setPeriod] = useState<MapPeriod>("7d");
  const [groups, setGroups] = useState<MuscleGroupVolume[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsBodyweight, setNeedsBodyweight] = useState(false);

  const load = useCallback(async (p: MapPeriod) => {
    setError(null);
    setNeedsBodyweight(false);
    setGroups(null);
    try {
      setGroups(await getMuscleGroupVolume(p));
    } catch (err) {
      if (isBodyweightRequired(err)) {
        setNeedsBodyweight(true);
        setError(err instanceof ApiError ? err.message : "Body weight is needed.");
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't load muscle map");
      }
    }
  }, []);

  useEffect(() => {
    // Initial + period-change fetch — Retry re-runs the same loader on demand.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(period);
  }, [period, load]);

  useEffect(() => {
    // A body-weight save anywhere heals this card without a manual retry.
    return onBodyweightSaved(() => {
      void load(period);
    });
  }, [period, load]);

  return (
    <Card
      title="Muscle map"
      action={
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            Calculated
          </span>
          <span className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Map period">
            {(Object.keys(PERIOD_LABEL) as MapPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={`min-h-11 rounded-md px-3 text-xs transition-colors ${
                  period === p ? "bg-accent-fill font-medium text-white" : "text-muted"
                }`}
              >
                {p === "7d" ? "7d" : "30d"}
              </button>
            ))}
          </span>
        </span>
      }
    >
      {error && (
        <ErrorNote
          message={error}
          action={
            needsBodyweight ? (
              <BodyweightErrorAction onSaved={() => void load(period)} />
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void load(period)}>
                Retry
              </Button>
            )
          }
        />
      )}
      {!error && groups === null && (
        <div aria-busy="true">
          <Skeleton className="h-[300px]" />
        </div>
      )}
      {!error && groups !== null && groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No sets logged in the {PERIOD_LABEL[period]}. Log a workout and trained muscles light
          up here.
        </p>
      )}
      {!error && groups !== null && groups.length > 0 && (
        <MuscleMap groups={groups} periodLabel={PERIOD_LABEL[period]} />
      )}
    </Card>
  );
}
