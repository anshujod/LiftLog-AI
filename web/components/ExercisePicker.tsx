"use client";

import { useEffect, useMemo, useState } from "react";
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
import { MovementArt } from "@/components/exercises/MovementArt";
import { ExerciseTile } from "@/components/exercises/ExerciseTile";

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

  const groupName = useMemo(() => {
    const m = new Map(muscleGroups.map((g) => [g.id, g.name]));
    return (id: number) => m.get(id) ?? "";
  }, [muscleGroups]);

  const groupSlug = useMemo(() => {
    const m = new Map(muscleGroups.map((g) => [g.id, g.slug]));
    return (id: number) => m.get(id) ?? "chest";
  }, [muscleGroups]);

  const isBrowsing = variant === "page" && !debouncedQuery && activeGroup === null;
  const shelves = useMemo(() => {
    if (!isBrowsing || !exercises) return [];
    return muscleGroups
      .map((g) => ({
        group: g,
        items: exercises.filter((e) => e.muscle_group_id === g.id),
      }))
      .filter((s) => s.items.length > 0);
  }, [isBrowsing, exercises, muscleGroups]);

  const listBody = (
    <>
      <div className="flex items-end gap-2 border-b-2 border-foreground/80 pb-2">
        <input
          type="search"
          autoFocus={variant === "page"}
          enterKeyHint="search"
          placeholder="Search exercises"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-faint"
        />
        <span className="pb-1 tabular-nums text-xs text-faint" aria-live="polite">
          {exercises !== null ? `${exercises.length}` : "—"}
        </span>
      </div>

      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 pt-1" role="tablist" aria-label="Muscle group filter">
        <FilterTab label="All" active={activeGroup === null} onClick={() => setActiveGroup(null)} />
        {muscleGroups.map((group) => (
          <FilterTab
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
          className="flex min-h-[52px] w-full items-center justify-between border border-dashed border-faint px-4 text-left"
        >
          <span className="text-xs font-bold uppercase tracking-[0.14em]">+ Add custom exercise</span>
          <span aria-hidden="true" className="text-muted">→</span>
        </button>
      )}

      <div className="flex flex-col">
        {error && <ErrorNote message={error} />}
        {!error && exercises === null && (
          <div aria-busy="true" aria-label="Loading exercises">
            <SkeletonStack rows={6} rowClassName="h-14" />
          </div>
        )}
        {!error && exercises !== null && exercises.length === 0 && (
          <div className="flex flex-col gap-1 py-10">
            <p className="text-xl font-semibold tracking-tight">
              {query ? `No match for "${query}"` : "No exercises found"}
            </p>
            <p className="text-sm text-muted">
              {query ? "Try a shorter name — “bench”, “row”, “curl”." : "Add a custom movement to start your library."}
            </p>
          </div>
        )}
        {!error && exercises !== null && exercises.length > 0 && isBrowsing && (
          <div className="flex flex-col gap-8">
            {shelves.map((shelf) => (
              <section key={shelf.group.id} aria-label={`${shelf.group.name} exercises`}>
                <div className="flex items-center gap-3 border-b hairline pb-2">
                  <MovementArt slug={shelf.group.slug} label={shelf.group.name} />
                  <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                    <h2 className="truncate text-[16px] font-semibold">{shelf.group.name}</h2>
                    <span className="shrink-0 tabular-nums text-xs text-muted">
                      {shelf.items.length} movements
                    </span>
                  </div>
                </div>
                <ul className="grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2">
                  {shelf.items.map((exercise) => (
                    <li key={exercise.id}>
                      <ExerciseTile
                        exercise={exercise}
                        groupSlug={shelf.group.slug}
                        groupName={shelf.group.name}
                        onSelect={onSelect}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {!error && exercises !== null && exercises.length > 0 && !isBrowsing && (
          <ul className="flex flex-col">
            {exercises.map((exercise) => (
              <li key={exercise.id} className="border-b hairline">
                <button
                  type="button"
                  onClick={() => onSelect(exercise)}
                  className="group flex min-h-[64px] w-full items-center gap-3 py-3 text-left"
                >
                  {variant === "page" && (
                    <MovementArt
                      slug={groupSlug(exercise.muscle_group_id)}
                      label={groupName(exercise.muscle_group_id)}
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-medium group-hover:text-acid">
                      {exercise.name}
                    </span>
                    <span className="text-[11px] text-muted">
                      {groupName(exercise.muscle_group_id)} · {LOAD_TYPE_LABELS[exercise.load_type]}
                      {exercise.is_custom ? " · Custom" : ""}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-muted">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  if (variant === "page") {
    return <div className="flex flex-1 flex-col gap-4">{listBody}</div>;
  }

  return (
    <Sheet title={title} onClose={onClose ?? (() => {})}>
      <div className="flex flex-col gap-4">{listBody}</div>
    </Sheet>
  );
}

function FilterTab({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-11 shrink-0 items-center px-3 text-[11px] font-bold uppercase tracking-[0.14em] ${
        active ? "bg-acid text-background" : "text-muted"
      }`}
    >
      {label}
    </button>
  );
}
