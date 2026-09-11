"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import {
  createExercise,
  listMuscleGroups,
  type Exercise,
  type LoadType,
  type MuscleGroup,
  type ProgressionMetric,
} from "@/lib/api/exercises";
import {
  LOAD_TYPE_DESCRIPTIONS,
  LOAD_TYPE_LABELS,
  LOAD_TYPES,
  PROGRESSION_METRIC_DESCRIPTIONS,
  PROGRESSION_METRIC_LABELS,
  PROGRESSION_METRICS,
} from "@/lib/loadTypes";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Sheet } from "@/components/ui/Sheet";

interface AddExerciseSheetProps {
  onCreated: (exercise: Exercise) => void;
  onClose: () => void;
}

export function AddExerciseSheet({ onCreated, onClose }: AddExerciseSheetProps) {
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [name, setName] = useState("");
  const [muscleGroupId, setMuscleGroupId] = useState<number | null>(null);
  const [loadType, setLoadType] = useState<LoadType>("barbell_total");
  const [progressionMetric, setProgressionMetric] = useState<ProgressionMetric>("e1rm");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listMuscleGroups()
      .then((groups) => {
        setMuscleGroups(groups);
        setMuscleGroupId((current) => current ?? groups[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (muscleGroupId === null) return;
    setError(null);
    setSubmitting(true);
    try {
      const exercise = await createExercise({
        name: name.trim(),
        muscle_group_id: muscleGroupId,
        load_type: loadType,
        progression_metric: progressionMetric,
        default_increment_g: 2500,
      });
      onCreated(exercise);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create exercise");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet title="Add custom exercise" onClose={onClose} tall>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="custom-exercise-name">
          Name
          <input
            id="custom-exercise-name"
            name="exercise-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="custom-exercise-muscle">
          Muscle group
          <select
            id="custom-exercise-muscle"
            name="muscle-group"
            required
            value={muscleGroupId ?? ""}
            onChange={(e) => setMuscleGroupId(Number(e.target.value))}
            className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
          >
            {muscleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1 text-sm text-muted">How is the load applied?</legend>
          {LOAD_TYPES.map((type) => (
            <label
              key={type}
              className={`flex min-h-11 flex-col justify-center gap-0.5 rounded-lg border px-4 py-3 text-sm ${
                loadType === type ? "border-accent bg-accent/10" : "border-border"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="load_type"
                  value={type}
                  checked={loadType === type}
                  onChange={() => setLoadType(type)}
                  className="h-5 w-5 accent-[var(--color-accent)]"
                />
                {LOAD_TYPE_LABELS[type]}
              </span>
              <span className="pl-7 text-xs text-muted">{LOAD_TYPE_DESCRIPTIONS[type]}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm text-muted" htmlFor="custom-exercise-metric">
          Track progress by
          <select
            id="custom-exercise-metric"
            name="progression-metric"
            value={progressionMetric}
            onChange={(e) => setProgressionMetric(e.target.value as ProgressionMetric)}
            className="h-12 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
          >
            {PROGRESSION_METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {PROGRESSION_METRIC_LABELS[metric]}
              </option>
            ))}
          </select>
          <span className="text-xs">{PROGRESSION_METRIC_DESCRIPTIONS[progressionMetric]}</span>
        </label>

        {error && <ErrorNote message={error} />}

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="w-full"
          loading={submitting}
          loadingLabel="Adding…"
          disabled={muscleGroupId === null}
        >
          Add exercise
        </Button>
      </form>
    </Sheet>
  );
}
