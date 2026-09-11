"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  listExercises,
  listMuscleGroups,
  type Exercise,
  type MuscleGroup,
} from "@/lib/api/exercises";
import { LOAD_TYPE_LABELS } from "@/lib/loadTypes";
import { ApiError } from "@/lib/api/errors";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Sheet } from "@/components/ui/Sheet";
import { SkeletonStack } from "@/components/ui/Skeleton";

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  /** "sheet" renders as a bottom-sheet overlay with its own backdrop and close button. */
  variant?: "page" | "sheet";
  onClose?: () => void;
  onAddCustom?: () => void;
  title?: string;
}

export function ExercisePicker({
  onSelect,
  variant = "page",
  onClose,
  onAddCustom,
  title = "Exercises",
}: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMuscleGroups()
      .then(setMuscleGroups)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    listExercises({ q: debouncedQuery || undefined, muscleGroup: activeGroup ?? undefined })
      .then((data) => {
        if (cancelled) return;
        setExercises(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setExercises([]);
        setError(err instanceof ApiError ? err.message : "Couldn't load exercises");
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, activeGroup]);

  const listBody = (
    <>
      <div className="flex items-center gap-2">
        <input
          type="search"
          autoFocus={variant === "page"}
          enterKeyHint="search"
          placeholder="Search exercises"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
        <FilterChip label="All" active={activeGroup === null} onClick={() => setActiveGroup(null)} />
        {muscleGroups.map((group) => (
          <FilterChip
            key={group.id}
            label={group.name}
            active={activeGroup === group.slug}
            onClick={() => setActiveGroup(group.slug)}
          />
        ))}
      </div>

      {onAddCustom && (
        <button
          type="button"
          onClick={onAddCustom}
          className="flex min-h-12 w-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-sm text-accent"
        >
          + Add custom exercise
        </button>
      )}

      <div className="flex flex-col">
        {error && <ErrorNote message={error} />}
        {!error && exercises === null && (
          <div aria-busy="true" aria-label="Loading exercises">
            <SkeletonStack rows={6} rowClassName="h-12" />
          </div>
        )}
        {!error && exercises !== null && exercises.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            {query ? `No exercises match "${query}"` : "No exercises found"}
          </p>
        )}
        {!error && exercises !== null && exercises.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => onSelect(exercise)}
                  className="flex min-h-12 w-full flex-col items-start justify-center gap-0.5 py-3 text-left"
                >
                  <span className="text-base">{exercise.name}</span>
                  <span className="text-xs text-muted">{LOAD_TYPE_LABELS[exercise.load_type]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  if (variant === "page") {
    return <div className="flex flex-1 flex-col gap-3">{listBody}</div>;
  }

  return (
    <Sheet title={title} onClose={onClose ?? (() => {})}>
      <div className="flex flex-col gap-3">{listBody}</div>
    </Sheet>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
      }`}
    >
      {label}
    </button>
  );
}
