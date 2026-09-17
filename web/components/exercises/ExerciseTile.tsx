"use client";

import { useEffect, useState } from "react";
import { getLastSession, type Exercise } from "@/lib/api/exercises";
import { LOAD_TYPE_LABELS } from "@/lib/loadTypes";
import { MovementArt } from "./MovementArt";

const sessionCache = new Map<string, { top: string | null; best: string | null; trained: boolean }>();

export function ExerciseTile({
  exercise,
  groupSlug,
  groupName,
  onSelect,
}: {
  exercise: Exercise;
  groupSlug: string;
  groupName: string;
  onSelect: (e: Exercise) => void;
}) {
  const [meta, setMeta] = useState<{ top: string | null; best: string | null; trained: boolean } | null>(
    () => sessionCache.get(exercise.id) ?? null
  );

  useEffect(() => {
    if (sessionCache.has(exercise.id)) return;
    let cancelled = false;
    getLastSession(exercise.id)
      .then((last) => {
        if (cancelled) return;
        const working = last.session?.sets.filter((s) => !s.is_warmup) ?? [];
        const top = working.reduce<(typeof working)[number] | null>(
          (b, s) => (!b || s.load.grams > b.load.grams ? s : b),
          null
        );
        const value = {
          top: top ? `${top.load.display} × ${top.reps}` : null,
          best: last.bests?.weight_pr
            ? `${last.bests.weight_pr.load.display} × ${last.bests.weight_pr.reps}`
            : null,
          trained: (last.session?.sets.length ?? 0) > 0,
        };
        sessionCache.set(exercise.id, value);
        setMeta(value);
      })
      .catch(() => {
        if (!cancelled) setMeta({ top: null, best: null, trained: false });
      });
    return () => {
      cancelled = true;
    };
  }, [exercise.id]);

  return (
    <button
      type="button"
      onClick={() => onSelect(exercise)}
      className="group flex min-w-0 flex-col gap-2 border hairline bg-surface p-3 text-left"
    >
      <MovementArt slug={groupSlug} label={groupName} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium leading-snug group-hover:text-acid">
          {exercise.name}
        </span>
        <span className="text-[11px] text-muted">{LOAD_TYPE_LABELS[exercise.load_type]}</span>
        <span className="tabular-nums text-xs text-muted" aria-live="polite">
          {meta === null ? "…" : meta.top ? `Last ${meta.top}` : "New movement"}
        </span>
        {meta?.best && (
          <span className="tabular-nums text-xs font-semibold text-acid">Best {meta.best}</span>
        )}
      </span>
    </button>
  );
}
