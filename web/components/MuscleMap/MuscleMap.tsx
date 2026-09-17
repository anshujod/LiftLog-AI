"use client";

import { useState } from "react";
import type { MuscleGroupVolume } from "@/lib/api/analytics";
import { MuscleBodySvg, type BodyView } from "./MuscleBodySvg";
import {
  ALL_MUSCLE_SLUGS,
  computeIntensityMap,
  displayName,
  relativeDayLabel,
  trainedCount,
  type IntensityLevel,
  type MuscleSlug,
} from "./muscleMeta";

interface MuscleMapProps {
  groups: MuscleGroupVolume[];
  periodLabel: string;
}

const INTENSITY_LABEL: Record<IntensityLevel, string> = {
  0: "Not trained",
  1: "Light",
  2: "Moderate",
  3: "High",
};

function InsightList({
  groups,
  selected,
  onSelect,
}: {
  groups: MuscleGroupVolume[];
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  const bySlug = new Map(groups.map((g) => [g.muscle_group_slug, g]));
  // Neglected first: untrained, then oldest trained. Trained-recent sinks.
  const ordered: MuscleSlug[] = [...ALL_MUSCLE_SLUGS].sort((a, b) => {
    const ga = bySlug.get(a);
    const gb = bySlug.get(b);
    const ta = ga?.last_trained_on ?? "";
    const tb = gb?.last_trained_on ?? "";
    if (!ta && !tb) return (ga?.working_set_count ?? 0) - (gb?.working_set_count ?? 0);
    if (!ta) return -1;
    if (!tb) return 1;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const mostNeglected = ordered[0];
  const mostNeglectedGroup = mostNeglected ? bySlug.get(mostNeglected) : undefined;
  return (
    <div
      className="flex flex-col"
      aria-label="Muscle group legend"
    >
      {mostNeglectedGroup &&
      (!mostNeglectedGroup.last_trained_on || mostNeglectedGroup.working_set_count === 0) ? (
        <p className="border-b hairline py-2 text-[13px] text-muted">
          Needs attention: {displayName(mostNeglected, groups)} —{" "}
          {mostNeglectedGroup.last_trained_on ? "not trained recently" : "not trained in this period"}
        </p>
      ) : null}
      {ordered.map((slug: MuscleSlug) => {
        const g = bySlug.get(slug);
        const name = displayName(slug, groups);
        const active = selected === slug;
        return (
          <button
            key={slug}
            type="button"
            onClick={() => onSelect(slug)}
            aria-pressed={active}
            aria-label={name}
            className={`flex min-h-[52px] items-baseline justify-between gap-3 border-b hairline py-2 text-left ${
              active ? "text-foreground" : ""
            }`}
          >
            <span className="flex min-w-0 items-baseline gap-3">
              <span
                aria-hidden="true"
                className={`h-4 w-1 shrink-0 ${g && g.working_set_count > 0 ? "bg-acid" : "bg-faint/40"}`}
              />
              <span className={`truncate text-[13px] font-bold uppercase tracking-[0.14em] ${active ? "text-acid" : ""}`}>
                {name}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-xs text-muted">
              {g ? `${g.working_set_count} SETS` : "—"}
              {g?.last_trained_on ? ` · ${relativeDayLabel(g.last_trained_on)?.toUpperCase() ?? ""}` : ""}
            </span>
          </button>
        );
      })}
      <p className="pt-2 text-[11px] uppercase tracking-[0.14em] text-faint">
        Acid = volume this period · dim = rested
      </p>
    </div>
  );
}

export function MuscleMap({ groups, periodLabel }: MuscleMapProps) {
  const [view, setView] = useState<BodyView>("front");
  const [selected, setSelected] = useState<string | null>(null);

  const intensity = computeIntensityMap(groups);
  const bySlug = new Map(groups.map((g) => [g.muscle_group_slug, g]));
  const trained = trainedCount(intensity);

  const selectedGroup = selected ? bySlug.get(selected) : undefined;
  const selectedLevel = (selected ? intensity[selected] : undefined) as IntensityLevel | undefined;

  function toggleSelect(slug: string) {
    setSelected((prev) => (prev === slug ? null : slug));
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr] md:gap-10">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow" aria-live="polite">
            {trained}/{ALL_MUSCLE_SLUGS.length} muscle groups · {periodLabel}
          </p>
          <div className="flex border hairline" role="tablist" aria-label="Body view">
            {(["front", "back"] as BodyView[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`min-h-11 px-4 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  view === v ? "bg-acid text-background" : "text-muted"
                }`}
              >
                {v === "front" ? "Front" : "Back"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center py-2">
          <MuscleBodySvg view={view} intensity={intensity} selected={selected} onSelect={toggleSelect} />
        </div>

        <div className="min-h-11 text-sm" aria-live="polite">
          {selectedGroup && selectedLevel !== undefined ? (
            <p>
              <span className="text-[16px] font-semibold">{selectedGroup.muscle_group_name}</span>{" "}
              <span className="text-muted">
                · {INTENSITY_LABEL[selectedLevel]} · {selectedGroup.working_set_count} sets ·{" "}
                {selectedGroup.volume.display}
                {selectedGroup.last_trained_on
                  ? ` · ${relativeDayLabel(selectedGroup.last_trained_on)}`
                  : ""}
              </span>
            </p>
          ) : (
            <p className="text-muted">Tap a muscle for sets, volume, and last trained day.</p>
          )}
        </div>
      </div>

      <InsightList groups={groups} selected={selected} onSelect={toggleSelect} />
    </div>
  );
}
