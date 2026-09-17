"use client";

import { useEffect, useRef, useState } from "react";
import { getLastSession, type Exercise } from "@/lib/api/exercises";
import { LOAD_TYPE_LABELS } from "@/lib/loadTypes";
import { MovementArt } from "./MovementArt";

const sessionCache = new Map<string, { top: string | null; best: string | null; trained: boolean }>();
// Failed lookups are cached briefly (not forever): without this, every mount
// of an unreachable exercise refires the request. Failures stay retryable.
const failureCache = new Map<string, number>();
const FAILURE_TTL_MS = 60_000;
const inflight = new Set<string>();

function failureFresh(id: string, now: number): boolean {
  const at = failureCache.get(id);
  return at !== undefined && now - at < FAILURE_TTL_MS;
}

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
  const rootRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (sessionCache.has(exercise.id) || failureFresh(exercise.id, Date.now())) return;
    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    const load = () => {
      if (inflight.has(exercise.id) || sessionCache.has(exercise.id)) return;
      inflight.add(exercise.id);
      getLastSession(exercise.id)
        .then((last) => {
          inflight.delete(exercise.id);
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
          inflight.delete(exercise.id);
          failureCache.set(exercise.id, Date.now());
          if (!cancelled) setMeta({ top: null, best: null, trained: false });
        });
    };

    // Shelves render the whole library at once — only resolve tiles near the
    // viewport so opening Exercises doesn't fan out ~30 requests. Content and
    // fallbacks are unchanged; below-fold tiles load as they scroll in.
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      load();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            load();
          }
        },
        { rootMargin: "400px" }
      );
      observer.observe(node);
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [exercise.id]);

  return (
    <button
      ref={rootRef}
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
