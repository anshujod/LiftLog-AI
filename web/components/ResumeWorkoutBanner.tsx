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
      className="flex h-11 shrink-0 items-center justify-center bg-accent px-4 text-center text-sm font-medium text-white"
    >
      Workout in progress — tap to resume
    </Link>
  );
}
