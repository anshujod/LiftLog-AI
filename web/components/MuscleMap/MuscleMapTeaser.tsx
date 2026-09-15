"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMuscleGroupVolume, type MuscleGroupVolume } from "@/lib/api/analytics";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { MuscleBodySvg } from "./MuscleBodySvg";
import { computeIntensityMap, trainedCount, ALL_MUSCLE_SLUGS } from "./muscleMeta";

/** Compact Home-screen preview: mini front silhouette + weekly coverage count. */
export function MuscleMapTeaser() {
  const [groups, setGroups] = useState<MuscleGroupVolume[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMuscleGroupVolume("7d")
      .then((data) => {
        if (!cancelled) setGroups(data);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (groups === null) {
    return (
      <Card title="This week">
        <div aria-busy="true">
          <Skeleton className="h-24" />
        </div>
      </Card>
    );
  }

  if (groups.length === 0) return null;

  const intensity = computeIntensityMap(groups);
  const trained = trainedCount(intensity);

  return (
    <Card
      title="This week"
      action={
        <Link href="/analysis" className="text-xs text-accent hover:underline">
          Full map →
        </Link>
      }
    >
      <Link href="/analysis" className="flex items-center gap-4" aria-label={`Muscle map: ${trained} of ${ALL_MUSCLE_SLUGS.length} muscle groups trained this week. See full analysis.`}>
        <MuscleBodySvg view="front" intensity={intensity} selected={null} onSelect={() => {}} compact />
        <span className="flex min-w-0 flex-col">
          <span className="tabular-nums text-xl font-semibold">
            {trained}/{ALL_MUSCLE_SLUGS.length}
          </span>
          <span className="text-sm text-muted">muscle groups trained</span>
          <span className="text-xs text-accent">Tap for full map →</span>
        </span>
      </Link>
    </Card>
  );
}
