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
import { ErrorNote } from "@/components/ui/ErrorNote";

interface WorkoutDetailProps {
  workoutId: string;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className={`numeral-giant text-4xl md:text-5xl ${accent ? "text-acid" : ""}`}>{value}</div>
      <div className="eyebrow mt-1">{label}</div>
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
        <div className="h-24 animate-pulse rounded-[2px] bg-surface" />
        <div className="h-24 animate-pulse rounded-[2px] bg-surface" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-10 pt-4 md:max-w-3xl">
      <Link href="/progress" className="text-xs font-bold uppercase tracking-[0.14em] text-muted">
        ← Progress
      </Link>

      {finishSummary && (
        <div className="flex flex-col gap-6 border-t-2 border-acid pt-5">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Session — Complete</p>
            <h1 className="font-display text-[clamp(48px,12vw,88px)] leading-[0.9]">
              Done<span className="text-acid">.</span>
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4">
            <Stat label="Exercises" value={String(finishSummary.exercise_count)} />
            <Stat label="Total sets" value={String(finishSummary.total_working_sets)} />
            <Stat label="Total volume" value={finishSummary.total_volume.display} />
            <Stat label="Duration" value={`${finishSummary.duration_minutes} min`} />
          </div>
          {finishSummary.new_prs.length > 0 && (
            <div className="flex flex-col gap-2 border-t hairline pt-4">
              <p className="eyebrow">New PRs</p>
              {finishSummary.new_prs.map((pr) => (
                <p key={`${pr.exercise_id}-${pr.pr_type}`} className="flex items-baseline gap-2 text-[15px]">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-acid" />
                  <span>
                    {pr.exercise_name} — <span className="tabular-nums font-bold text-acid">{pr.value.display}</span>
                    {pr.reps ? ` × ${pr.reps}` : ""}
                  </span>
                </p>
              ))}
            </div>
          )}
          <div className="border-t hairline pt-4">
            {savedTemplateId ? (
              <p className="text-sm font-bold uppercase tracking-[0.12em] text-acid" role="status">
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
                <label className="eyebrow" htmlFor="template-name">
                  Template name
                </label>
                <input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={workout.title ?? "My template"}
                  maxLength={200}
                  className="h-12 rounded-[2px] border hairline bg-sunken px-3 text-base outline-none focus:border-acid"
                />
                {saveTemplateError && <ErrorNote message={saveTemplateError} />}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!templateName.trim() || savingTemplate}
                    className="slab-press h-12 flex-1 rounded-[2px] bg-acid font-display text-base tracking-wide text-background disabled:opacity-50"
                  >
                    {savingTemplate ? "Saving…" : "Save template"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveForm(false)}
                    className="h-12 rounded-[2px] border hairline px-4 text-sm"
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
                className="min-h-[48px] w-full text-left text-xs font-bold uppercase tracking-[0.14em] text-foreground underline decoration-faint underline-offset-4"
              >
                Save this workout as a template →
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 border-t hairline pt-4">
        <p className="eyebrow">{formatRelativeDate(workout.performed_on)} · {formatAbsoluteDate(workout.performed_on)}</p>
        <h2 className="font-display text-3xl tracking-tight">{workout.title ?? "Workout"}</h2>
      </div>

      {workout.workout_exercises.map((we, i) => (
        <div key={we.id} className="flex flex-col gap-2 border-t hairline pt-4">
          <p className="flex items-baseline gap-3">
            <span className="font-display text-base text-acid">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-[17px] font-medium">{we.exercise.name}</span>
          </p>
          <div className="flex flex-col">
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
