"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getWorkout,
  updateSet as apiUpdateSet,
  deleteSet as apiDeleteSet,
  type Workout,
  type FinishSummary,
} from "@/lib/api/workouts";
import { saveWorkoutAsTemplate } from "@/lib/api/templates";
import { SetRow, type SetRowValues } from "@/components/SetRow";
import { getUnitPreference, type Unit } from "@/lib/units";
import { formatAbsoluteDate, formatRelativeDate } from "@/lib/dates";
import { ApiError } from "@/lib/api/errors";

interface WorkoutDetailProps {
  workoutId: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tabular-nums text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export function WorkoutDetail({ workoutId }: WorkoutDetailProps) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [finishSummary] = useState<FinishSummary | null>(() => {
    try {
      const raw = sessionStorage.getItem(`liftlog:finish:${workoutId}`);
      return raw ? (JSON.parse(raw) as FinishSummary) : null;
    } catch {
      return null;
    }
  });
  const [unit, setUnit] = useState<Unit>("kg");
  const [error, setError] = useState<string | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getWorkout(workoutId)
      .then((data) => {
        if (!cancelled) setWorkout(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load this workout");
      });

    getUnitPreference()
      .then(setUnit)
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [workoutId]);

  async function handleUpdateSet(workoutExerciseId: string, setId: string, values: SetRowValues) {
    setWorkout((prev) =>
      prev
        ? {
            ...prev,
            workout_exercises: prev.workout_exercises.map((we) =>
              we.id === workoutExerciseId
                ? {
                    ...we,
                    sets: we.sets.map((s) =>
                      s.id === setId
                        ? {
                            ...s,
                            reps: values.reps,
                            is_warmup: values.is_warmup,
                            load: { ...s.load, grams: values.load_g },
                          }
                        : s
                    ),
                  }
                : we
            ),
          }
        : prev
    );
    try {
      await apiUpdateSet(setId, { load_g: values.load_g, reps: values.reps, is_warmup: values.is_warmup });
    } catch {
      // best-effort optimistic edit — a reconciling refetch would double the requests per edit
    }
  }

  async function handleSaveAsTemplate() {
    if (!workout || !templateName.trim() || savingTemplate) return;
    setSavingTemplate(true);
    setSaveTemplateError(null);
    try {
      const template = await saveWorkoutAsTemplate(workout.id, { name: templateName.trim() });
      setSavedTemplateId(template.id);
      setShowSaveForm(false);
      setTemplateName("");
    } catch (err) {
      setSaveTemplateError(err instanceof ApiError ? err.message : "Couldn't save the template");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteSet(workoutExerciseId: string, setId: string) {
    setWorkout((prev) =>
      prev
        ? {
            ...prev,
            workout_exercises: prev.workout_exercises.map((we) =>
              we.id === workoutExerciseId ? { ...we, sets: we.sets.filter((s) => s.id !== setId) } : we
            ),
          }
        : prev
    );
    try {
      await apiDeleteSet(setId);
    } catch {
      // best-effort
    }
  }

  if (error) {
    return (
      <p className="p-4 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }

  if (!workout) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href="/history" className="text-sm text-muted">
        ← History
      </Link>

      {finishSummary && (
        <div className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
          <p className="text-lg font-semibold">Workout complete 🎉</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Exercises" value={String(finishSummary.exercise_count)} />
            <Stat label="Total sets" value={String(finishSummary.total_working_sets)} />
            <Stat label="Total volume" value={finishSummary.total_volume.display} />
            <Stat label="Duration" value={`${finishSummary.duration_minutes} min`} />
          </div>
          {finishSummary.new_prs.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-success/30 pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">New PRs</p>
              {finishSummary.new_prs.map((pr) => (
                <p key={`${pr.exercise_id}-${pr.pr_type}`} className="text-sm">
                  🏆 {pr.exercise_name} — {pr.value.display}
                  {pr.reps ? ` × ${pr.reps}` : ""}
                </p>
              ))}
            </div>
          )}
          <div className="border-t border-success/30 pt-3">
            {savedTemplateId ? (
              <p className="text-sm text-success" role="status">
                Saved as a template.
              </p>
            ) : showSaveForm ? (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveAsTemplate();
                }}
              >
                <label className="text-xs font-medium uppercase tracking-wide text-muted" htmlFor="template-name">
                  Template name
                </label>
                <input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={workout.title ?? "My template"}
                  maxLength={200}
                  className="h-11 rounded-lg border border-border bg-surface px-3 text-base"
                />
                {saveTemplateError && (
                  <p className="text-sm text-danger" role="alert">
                    {saveTemplateError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!templateName.trim() || savingTemplate}
                    className="h-11 flex-1 rounded-lg bg-accent text-sm font-medium text-white disabled:opacity-50"
                  >
                    {savingTemplate ? "Saving…" : "Save template"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveForm(false)}
                    className="h-11 rounded-lg border border-border px-4 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTemplateName(workout.title ?? "");
                  setShowSaveForm(true);
                }}
                className="h-11 w-full rounded-lg border border-border text-sm font-medium"
              >
                Save this workout as a template
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold">{workout.title ?? "Workout"}</h1>
        <p className="text-sm text-muted">
          {formatRelativeDate(workout.performed_on)} · {formatAbsoluteDate(workout.performed_on)}
        </p>
      </div>

      {workout.workout_exercises.map((we) => (
        <div key={we.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-lg font-semibold">{we.exercise.name}</p>
          <div className="flex flex-col divide-y divide-border">
            {we.sets.map((s) => (
              <SetRow
                key={s.id}
                unit={unit}
                incrementG={we.exercise.default_increment_g}
                mode="logged"
                syncStatus="synced"
                initial={{ load_g: s.load.grams, reps: s.reps, is_warmup: s.is_warmup }}
                onChange={(values) => void handleUpdateSet(we.id, s.id, values)}
                onDelete={() => void handleDeleteSet(we.id, s.id)}
              />
            ))}
            {we.sets.length === 0 && <p className="py-2 text-sm text-muted">No sets logged.</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
