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
      <div className="flex items-center gap-2 px-4 pt-4">
        <input
          type="search"
          autoFocus={variant === "sheet"}
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 flex-1 rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none focus:border-accent"
        />
        {variant === "sheet" && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-12 shrink-0 rounded-lg px-3 text-sm text-muted"
          >
            Close
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-3">
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
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={onAddCustom}
            className="w-full rounded-lg border border-dashed border-border py-3 text-sm text-accent"
          >
            + Add custom exercise
          </button>
        </div>
      )}

      <div className="px-4 pb-4 pt-2">
        {error && (
          <p className="py-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {!error && exercises === null && <ExerciseListSkeleton />}
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
    return <div className="flex flex-1 flex-col">{listBody}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[85vh] flex-col overflow-y-auto rounded-t-2xl bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center px-4 pt-3">
          <span className="text-sm font-medium text-muted">{title}</span>
        </div>
        {listBody}
      </div>
    </div>
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
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"
      }`}
    >
      {label}
    </button>
  );
}

function ExerciseListSkeleton() {
  return (
    <ul className="flex flex-col gap-3 py-2" aria-busy="true" aria-label="Loading exercises">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="h-10 animate-pulse rounded bg-surface" />
      ))}
    </ul>
  );
}
