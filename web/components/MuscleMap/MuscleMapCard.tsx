"use client";

import { useCallback, useEffect, useState } from "react";
import { getMuscleGroupVolume, type MuscleGroupVolume, type Period } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/errors";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
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
    return onBodyweightSaved(() => {
      void load(period);
    });
  }, [period, load]);

  return (
    <section className="flex flex-col gap-4 border-t-2 border-foreground/80 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Body — Trained vs rested</p>
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">
            Muscle map<span className="text-acid">.</span>
          </h2>
        </div>
        <div className="w-40">
          <Segmented
            options={["7d", "30d"] as const}
            value={period}
            onChange={setPeriod}
            ariaLabel="Map period"
          />
        </div>
      </div>
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
        <div className="flex flex-col gap-1 py-6">
          <p className="text-lg font-semibold">Nothing trained in the {PERIOD_LABEL[period]}.</p>
          <p className="text-sm text-muted">Log a session and trained muscle lights up here.</p>
        </div>
      )}
      {!error && groups !== null && groups.length > 0 && (
        <MuscleMap groups={groups} periodLabel={PERIOD_LABEL[period]} />
      )}
    </section>
  );
}
