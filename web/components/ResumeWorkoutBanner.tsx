"use client";

import Link from "next/link";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";

/** Shows a tap-to-resume strip when the caller has a workout that was started but
 * never finished. Quiet by design — the dashboard CTA owns the action. */
export function ResumeWorkoutBanner() {
  const activeWorkoutId = useActiveWorkoutId();

  if (!activeWorkoutId) return null;

  return (
    <Link
      href={`/workout?resume=${activeWorkoutId}`}
      role="status"
      className="animate-banner-in flex min-h-11 shrink-0 items-center justify-center gap-2 border-b border-border bg-surface px-4 py-2.5 text-center text-sm text-foreground"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 bg-acid" />
      <span className="truncate">Workout in progress — tap to resume</span>
      <span aria-hidden="true" className="text-muted">›</span>
    </Link>
  );
}
