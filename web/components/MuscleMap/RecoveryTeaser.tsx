"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMuscleRecovery, type MuscleRecovery } from "@/lib/api/analytics";
import { RECOVERY_HUE } from "./muscleMeta";

/** One-line Dashboard teaser: recovering/rest counts linking to Analysis. Silent on failure. */
export function RecoveryTeaser() {
  const [groups, setGroups] = useState<MuscleRecovery[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMuscleRecovery()
      .then((data) => {
        if (!cancelled) setGroups(data);
      })
      .catch(() => {
        if (!cancelled) setGroups(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (groups === null || groups.length === 0) return null;
  const recovering = groups.filter((g) => g.status === "recovering").length;
  const rest = groups.filter((g) => g.status === "rest").length;
  if (recovering === 0 && rest === 0) return null;

  return (
    <Link
      href="/analysis"
      className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted"
      aria-label={`${recovering} muscles recovering, ${rest} needing rest. See recovery status.`}
    >
      <span className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: RECOVERY_HUE.recovering }}
        />
        {recovering} recovering
      </span>
      <span aria-hidden="true">·</span>
      <span className="flex items-center gap-1">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: RECOVERY_HUE.rest }}
        />
        {rest} at rest
      </span>
      <span aria-hidden="true" className="text-accent">
        →
      </span>
    </Link>
  );
}
