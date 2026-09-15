"use client";

import { useState } from "react";
import type { MuscleGroupVolume } from "@/lib/api/analytics";
import { MuscleBodySvg, type BodyView } from "./MuscleBodySvg";
import {
  ALL_MUSCLE_SLUGS,
  computeIntensityMap,
  relativeDayLabel,
  trainedCount,
  type IntensityLevel,
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

function Legend() {
  const swatches: { level: IntensityLevel; label: string }[] = [
    { level: 0, label: "Rest" },
    { level: 1, label: "Light" },
    { level: 2, label: "Mod" },
    { level: 3, label: "High" },
  ];
  return (
    <div className="flex items-center justify-center gap-3 text-xs text-muted" aria-label="Intensity legend">
      {swatches.map((s) => (
        <span key={s.level} className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-sm border border-border"
            style={{
              backgroundColor:
                s.level === 0 ? "var(--color-surface-raised)" : "var(--color-accent-fill)",
              opacity: s.level === 0 ? 1 : [0, 0.35, 0.65, 1][s.level],
            }}
          />
          {s.label}
        </span>
      ))}
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

      <Legend />

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
