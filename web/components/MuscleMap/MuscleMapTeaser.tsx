"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMuscleGroupVolume, type MuscleGroupVolume } from "@/lib/api/analytics";
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
      <div aria-busy="true">
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (groups.length === 0) return null;

  const intensity = computeIntensityMap(groups);
  const trained = trainedCount(intensity);

  return (
    <Link href="/progress" className="flex items-center gap-4 border-t hairline pt-4" aria-label={`Muscle map: ${trained} of ${ALL_MUSCLE_SLUGS.length} muscle groups trained this week. See full analysis.`}>
      <MuscleBodySvg view="front" intensity={intensity} selected={null} onSelect={() => {}} compact />
      <span className="flex min-w-0 flex-col">
        <span className="numeral-giant text-3xl">
          {trained}/{ALL_MUSCLE_SLUGS.length}
        </span>
        <span className="eyebrow mt-1">muscle groups trained</span>
        <span className="pt-1 text-xs font-bold uppercase tracking-[0.14em] text-acid">Full map →</span>
      </span>
    </Link>
  );
}
