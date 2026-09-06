"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useActiveWorkout } from "@/hooks/useActiveWorkout";
import { useWakeLock } from "@/hooks/useWakeLock";
import { ExercisePicker } from "@/components/ExercisePicker";
import { WorkoutExerciseCard } from "@/components/WorkoutExerciseCard";
import { RestTimer } from "@/components/RestTimer";
import { getUnitPreference, type Unit } from "@/lib/units";
import type { SetRowValues } from "@/components/SetRow";
import { getExercise, type Exercise } from "@/lib/api/exercises";
import {
  listTemplates,
  startWorkoutFromTemplate,
  type WorkoutTemplateSummary,
} from "@/lib/api/templates";
import { ApiError } from "@/lib/api/errors";

function SyncIndicator({ pendingCount, retrying }: { pendingCount: number; retrying: boolean }) {
  if (pendingCount === 0) return null;
  return <span className="text-xs text-muted">{retrying ? "Waiting for connection…" : "Syncing…"}</span>;
}

export function ActiveWorkoutScreen() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resume");
  const suggestParam = searchParams.get("suggest");
  const router = useRouter();
  const activeWorkout = useActiveWorkout(resumeId);
  const [unit, setUnit] = useState<Unit>("kg");
  const [showPicker, setShowPicker] = useState(false);
  const [restKey, setRestKey] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkoutTemplateSummary[] | null>(null);
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const suggestionStartedRef = useRef(false);

  useWakeLock(activeWorkout.status === "ready");

  useEffect(() => {
    getUnitPreference()
      .then(setUnit)
      .catch(() => {});
  }, []);

  // A "Start this workout" tap from the dashboard's suggestion card lands here
  // with ?suggest=<exerciseId,...> — turn that into an actual one-tap start.
  useEffect(() => {
    if (activeWorkout.status !== "none" || !suggestParam || suggestionStartedRef.current) return;
    suggestionStartedRef.current = true;
    const ids = suggestParam.split(",").filter(Boolean);
    void (async () => {
      const exercises = (await Promise.allSettled(ids.map((id) => getExercise(id))))
        .filter((r): r is PromiseFulfilledResult<Exercise> => r.status === "fulfilled")
        .map((r) => r.value);
      await activeWorkout.startWithExercises(exercises);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkout.status, suggestParam]);

  useEffect(() => {
    if (activeWorkout.status !== "none") return;
    let cancelled = false;
    listTemplates()
      .then((data) => {
        if (!cancelled) setTemplates(data);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkout.status]);

  async function handleStartFromTemplate(templateId: string) {
    setStartingTemplateId(templateId);
    setTemplateError(null);
    try {
      const workout = await startWorkoutFromTemplate(templateId);
      router.push(`/workout?resume=${workout.id}`);
    } catch (err) {
      setTemplateError(err instanceof ApiError ? err.message : "Couldn't start from the template");
      setStartingTemplateId(null);
    }
  }

  function handleLogSet(workoutExerciseId: string, values: SetRowValues) {
    activeWorkout.addSet(workoutExerciseId, values);
    setRestKey((k) => k + 1);
  }

  function handleAddExercise(exercise: Exercise) {
    setShowPicker(false);
    void activeWorkout.addExercise(exercise);
  }

  async function handleFinish() {
    if (!activeWorkout.canFinish || !activeWorkout.workout) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const summary = await activeWorkout.finish();
      try {
        sessionStorage.setItem(`liftlog:finish:${activeWorkout.workout.id}`, JSON.stringify(summary));
      } catch {
        // non-critical — the detail page still renders without the celebratory summary
      }
      router.push(`/workout/${activeWorkout.workout.id}`);
    } catch (err) {
      setFinishError(err instanceof ApiError ? err.message : "Couldn't finish the workout");
      setFinishing(false);
    }
  }

  if (activeWorkout.status === "resolving" || activeWorkout.status === "loading") {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (activeWorkout.status === "error") {
    return (
      <p className="p-4 text-sm text-danger" role="alert">
        {activeWorkout.error}
      </p>
    );
  }

  if (activeWorkout.status === "none") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-muted">No workout in progress.</p>
        <button
          type="button"
          onClick={() => void activeWorkout.start()}
          className="h-14 w-full max-w-xs rounded-lg bg-accent text-lg font-medium text-white"
        >
          Start workout
        </button>

        {templates !== null && templates.length > 0 && (
          <div className="flex w-full max-w-xs flex-col gap-2 pt-2 text-left">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Start from a template
            </p>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={startingTemplateId !== null}
                onClick={() => void handleStartFromTemplate(template.id)}
                className="flex h-12 items-center justify-between rounded-lg border border-border px-4 text-sm disabled:opacity-50"
              >
                <span className="truncate font-medium">
                  {template.name} · {template.exercise_count}
                </span>
                <span className="text-accent">
                  {startingTemplateId === template.id ? "Starting…" : "Start"}
                </span>
              </button>
            ))}
            {templateError && (
              <p className="text-sm text-danger" role="alert">
                {templateError}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Workout</h1>
        <SyncIndicator pendingCount={activeWorkout.pendingCount} retrying={activeWorkout.retrying} />
      </div>

      {restKey > 0 && <RestTimer key={restKey} />}

      {activeWorkout.exercises.map((ex) => (
        <WorkoutExerciseCard
          key={ex.workoutExerciseId}
          displayExercise={ex}
          unit={unit}
          onLogSet={(values) => handleLogSet(ex.workoutExerciseId, values)}
          onUpdateSet={(clientId, values) => activeWorkout.updateSet(ex.workoutExerciseId, clientId, values)}
          onDeleteSet={(clientId) => activeWorkout.deleteSet(ex.workoutExerciseId, clientId)}
          onRemoveExercise={() => void activeWorkout.removeExercise(ex.workoutExerciseId)}
        />
      ))}

      <button
        type="button"
        onClick={() => setShowPicker(true)}
        className="h-12 rounded-lg border border-dashed border-border text-sm text-accent"
      >
        + Add exercise
      </button>

      {finishError && (
        <p className="text-sm text-danger" role="alert">
          {finishError}
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleFinish()}
        disabled={!activeWorkout.canFinish || finishing || activeWorkout.exercises.length === 0}
        className="h-14 rounded-lg bg-accent text-lg font-medium text-white disabled:opacity-50"
      >
        {finishing ? "Finishing…" : activeWorkout.canFinish ? "Finish workout" : "Syncing…"}
      </button>

      {showPicker && (
        <ExercisePicker variant="sheet" onSelect={handleAddExercise} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
