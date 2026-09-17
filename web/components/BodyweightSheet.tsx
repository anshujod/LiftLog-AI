"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { updateBodyweight } from "@/lib/api/me";
import { getUnitPreference, unitToG, type Unit } from "@/lib/units";
import { ApiError } from "@/lib/api/errors";

interface BodyweightSheetProps {
  onClose: () => void;
  /** Called with the saved bodyweight (grams) so the caller can retry its action. */
  onSaved: (bodyweightG: number) => void;
}

/** Enter-body-weight sheet, shown when the backend needs it for
 * bodyweight-type lifts (finish, analytics). Unit-aware, grams on the wire. */
export function BodyweightSheet({ onClose, onSaved }: BodyweightSheetProps) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Unit preference is cached; resolve it for the label without blocking render.
  useEffect(() => {
    let cancelled = false;
    getUnitPreference()
      .then((u) => {
        if (!cancelled) setUnit(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
      setError(`Enter your body weight in ${unit} (0–500).`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const grams = unitToG(parsed, unit);
      await updateBodyweight(grams);
      onSaved(grams);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save body weight");
      setSaving(false);
    }
  }

  return (
    <Sheet title="Your body weight?" onClose={onClose}>
      <p className="text-sm text-muted">
        Your workout includes bodyweight exercises (pull-ups, dips, …). Your body weight is
        needed to compute their volume and records — it&apos;s stored once and used
        everywhere.
      </p>
      {error && <ErrorNote message={error} />}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Body weight ({unit})</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder={unit === "kg" ? "80" : "175"}
          aria-label={`Body weight in ${unit}`}
          className="h-14 rounded-[2px] border hairline bg-sunken px-4 text-xl tabular-nums focus:border-acid focus:outline-none"
        />
      </label>
      <Button variant="primary" size="md" loading={saving} onClick={() => void handleSave()}>
        Save &amp; finish workout
      </Button>
    </Sheet>
  );
}
