import { Suspense } from "react";
import { ActiveWorkoutScreen } from "@/components/ActiveWorkoutScreen";

export default function WorkoutPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
      <ActiveWorkoutScreen />
    </Suspense>
  );
}
