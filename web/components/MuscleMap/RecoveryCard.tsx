"use client";

import { useCallback, useEffect, useState } from "react";
import { getMuscleRecovery, type MuscleRecovery } from "@/lib/api/analytics";
import { ApiError } from "@/lib/api/errors";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Button } from "@/components/ui/Button";
import { BodyweightErrorAction } from "@/components/BodyweightErrorAction";
import { isBodyweightRequired, onBodyweightSaved } from "@/lib/api/bodyweight-events";
import { MuscleBodySvg } from "./MuscleBodySvg";
import {
  RECOVERY_HUE,
  RECOVERY_REGIONS,
  RECOVERY_STATUS_LABEL,
  displayName,
  relativeDayLabel,
  type RecoveryStatus,
} from "./muscleMeta";

function Legend() {
  const items: RecoveryStatus[] = ["ready", "recovering", "rest"];
  return (
    <div className="flex items-center justify-center gap-4 text-xs text-muted" aria-label="Recovery legend">
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: RECOVERY_HUE[s] }}
          />
          {RECOVERY_STATUS_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

export function RecoveryCard() {
  const [groups, setGroups] = useState<MuscleRecovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsBodyweight, setNeedsBodyweight] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNeedsBodyweight(false);
    setGroups(null);
    try {
      setGroups(await getMuscleRecovery());
    } catch (err) {
      if (isBodyweightRequired(err)) {
        setNeedsBodyweight(true);
        setError(err instanceof ApiError ? err.message : "Body weight is needed.");
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't load recovery status");
      }
    }
  }, []);

  useEffect(() => {
    // Initial fetch only — Retry re-runs the same loader on demand.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    // A body-weight save anywhere heals this card without a manual retry.
    return onBodyweightSaved(() => {
      void load();
    });
  }, [load]);

  const bySlug = new Map((groups ?? []).map((g) => [g.muscle_group_slug, g]));
  const recoveryMap = Object.fromEntries(
    (groups ?? []).map((g) => [g.muscle_group_slug, g.status])
  ) as Record<string, RecoveryStatus>;
  const recoveringCount = (groups ?? []).filter((g) => g.status === "recovering").length;
  const restCount = (groups ?? []).filter((g) => g.status === "rest").length;
  const selectedGroup = selected ? bySlug.get(selected) : undefined;

  const headline =
    recoveringCount === 0 && restCount === 0
      ? "All muscle groups ready"
      : [
          recoveringCount > 0 ? `${recoveringCount} recovering` : null,
          restCount > 0 ? `${restCount} need rest` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  function toggleSelect(slug: string) {
    setSelected((prev) => (prev === slug ? null : slug));
  }

  return (
    <Card
      title="Recovery status"
      action={
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
            Estimate
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand recovery status" : "Collapse recovery status"}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className={`h-5 w-5 transition-transform ${collapsed ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
        </span>
      }
    >
      {error && (
        <ErrorNote
          message={error}
          action={
            needsBodyweight ? (
              <BodyweightErrorAction onSaved={() => void load()} />
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                Retry
              </Button>
            )
          }
        />
      )}
      {!error && groups === null && (
        <div aria-busy="true">
          <Skeleton className="h-[300px]" />
        </div>
      )}
      {!error && groups !== null && !collapsed && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {headline}
          </p>

          <div className="flex items-start justify-center gap-6">
            <MuscleBodySvg
              view="front"
              intensity={{}}
              selected={selected}
              onSelect={toggleSelect}
              compact
              paint="recovery"
              recovery={recoveryMap}
            />
            <MuscleBodySvg
              view="back"
              intensity={{}}
              selected={selected}
              onSelect={toggleSelect}
              compact
              paint="recovery"
              recovery={recoveryMap}
            />
          </div>

          <Legend />

          <div className="flex flex-col gap-3">
            {RECOVERY_REGIONS.map((region) => (
              <div key={region.title} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                  {region.title}
                </h3>
                <ul className="flex flex-col">
                  {region.slugs.map((slug) => {
                    const g = bySlug.get(slug);
                    if (!g) return null;
                    return (
                      <li key={slug}>
                        <button
                          type="button"
                          onClick={() => toggleSelect(slug)}
                          aria-pressed={selected === slug}
                          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left"
                        >
                          <span
                            aria-hidden="true"
                            className="h-6 w-1 shrink-0 rounded-full"
                            style={{ backgroundColor: RECOVERY_HUE[g.status] }}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {displayName(slug, groups)}
                          </span>
                          <span
                            className="shrink-0 tabular-nums text-sm"
                            style={{ color: RECOVERY_HUE[g.status] }}
                          >
                            {g.percent}%
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="min-h-11 text-center text-sm" aria-live="polite">
            {selectedGroup ? (
              <p>
                <span className="font-medium">{selectedGroup.muscle_group_name}</span>{" "}
                <span className="text-muted">
                  · {RECOVERY_STATUS_LABEL[selectedGroup.status]} · {selectedGroup.percent}%
                  {selectedGroup.last_trained_on
                    ? ` · trained ${relativeDayLabel(selectedGroup.last_trained_on)}`
                    : " · not trained recently"}
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted">
                Based on training recency + volume · an estimate, not medical advice.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
