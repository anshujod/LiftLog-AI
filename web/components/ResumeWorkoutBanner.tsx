"use client";

import Link from "next/link";
import { useActiveWorkoutId } from "@/hooks/useActiveWorkoutId";

/** Shows a tap-to-resume banner when the caller has a workout that was started but
 * never finished. */
export function ResumeWorkoutBanner() {
  const activeWorkoutId = useActiveWorkoutId();

  if (!activeWorkoutId) return null;

  return (
    <Link
      href={`/workout?resume=${activeWorkoutId}`}
      role="status"
      className="animate-banner-in flex min-h-11 shrink-0 items-center justify-center gap-1 bg-accent-fill px-4 py-2.5 text-center text-sm font-semibold text-white"
    >
      <span className="truncate">Workout in progress — tap to resume</span>
      <span aria-hidden="true">›</span>
    </Link>
  );
}
