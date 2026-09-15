"use client";

import { useState } from "react";
import type { MuscleGroupVolume } from "@/lib/api/analytics";
import { MuscleBodySvg, type BodyView } from "./MuscleBodySvg";
import {
  ALL_MUSCLE_SLUGS,
  GROUP_HUE,
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

function Legend({
  groups,
  selected,
  onSelect,
}: {
  groups: MuscleGroupVolume[];
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-muted"
        aria-label="Muscle group legend"
      >
        {ALL_MUSCLE_SLUGS.map((slug: MuscleSlug) => (
          <button
            key={slug}
            type="button"
            onClick={() => onSelect(slug)}
            aria-pressed={selected === slug}
            className={`flex min-h-11 items-center gap-1 rounded-md px-1 ${
              selected === slug ? "text-foreground" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-sm border border-border"
              style={{ backgroundColor: GROUP_HUE[slug] }}
            />
            {displayName(slug, groups)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">Shade = volume this period · gray = rested</p>
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">
          {trained}/{ALL_MUSCLE_SLUGS.length} muscle groups · {periodLabel}
        </p>
        <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Body view">
          {(["front", "back"] as BodyView[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`min-h-11 rounded-md px-4 text-sm transition-colors ${
                view === v ? "bg-accent-fill font-medium text-white" : "text-muted"
              }`}
            >
              {v === "front" ? "Front" : "Back"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <MuscleBodySvg view={view} intensity={intensity} selected={selected} onSelect={toggleSelect} />
      </div>

      <Legend groups={groups} selected={selected} onSelect={toggleSelect} />

      <div className="min-h-11 text-center text-sm" aria-live="polite">
        {selectedGroup && selectedLevel !== undefined ? (
          <p>
            <span className="font-medium">{selectedGroup.muscle_group_name}</span>{" "}
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
  );
}
