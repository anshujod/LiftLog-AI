"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getMe, updateBodyweight, updateUnitPreference, type Me } from "@/lib/api/me";
import { ApiError } from "@/lib/api/errors";
import {
  getUnitPreference,
  gToUnitValue,
  resetUnitPreferenceCache,
  unitToG,
  type Unit,
} from "@/lib/units";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Skeleton } from "@/components/ui/Skeleton";
import { notifyBodyweightSaved } from "@/lib/api/bodyweight-events";

export function ProfileScreen() {
  const { logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unit, setUnit] = useState<Unit>("kg");
  const [weightInput, setWeightInput] = useState("");
  const [weightSaved, setWeightSaved] = useState(false);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [savingWeight, setSavingWeight] = useState(false);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await getMe();
      setMe(data);
      const preferred = await getUnitPreference().catch(() => data.unit_preference as Unit);
      setUnit(preferred);
      if (data.bodyweight_g !== null) {
        setWeightInput(String(gToUnitValue(data.bodyweight_g, preferred)));
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load profile");
    }
  }, []);

  useEffect(() => {
    // Initial fetch only — Retry re-runs the same loader on demand.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function handleSaveWeight() {
    const parsed = Number(weightInput);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
      setWeightError(`Enter your body weight in ${unit} (0–500).`);
      return;
    }
    setWeightError(null);
    setWeightSaved(false);
    setSavingWeight(true);
    try {
      const updated = await updateBodyweight(unitToG(parsed, unit));
      setMe(updated);
      setWeightSaved(true);
      notifyBodyweightSaved();
    } catch (err) {
      setWeightError(err instanceof ApiError ? err.message : "Couldn't save body weight");
    } finally {
      setSavingWeight(false);
    }
  }

  async function handleUnitChange(next: Unit) {
    if (next === unit) return;
    setUnitError(null);
    const previous = unit;
    setUnit(next);
    // Re-render the input in the new unit from the saved value when known.
    if (me?.bodyweight_g !== null && me?.bodyweight_g !== undefined) {
      setWeightInput(String(gToUnitValue(me.bodyweight_g, next)));
    }
    try {
      const updated = await updateUnitPreference(next);
      setMe(updated);
      resetUnitPreferenceCache();
    } catch (err) {
      setUnit(previous);
      setUnitError(err instanceof ApiError ? err.message : "Couldn't save units");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Profile</h1>

      {loadError && (
        <ErrorNote
          message={loadError}
          action={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      )}
      {!loadError && me === null && (
        <div aria-busy="true">
          <Skeleton className="h-32" />
        </div>
      )}

      {me && (
        <>
          <Card title="Account">
            <p className="truncate text-sm">{me.email}</p>
          </Card>

          <Card title="Body weight">
            <p className="text-sm text-muted">
              Needed for bodyweight exercises (pull-ups, dips, …) — volume and records
              can&apos;t be computed without it.
            </p>
            {weightError && <ErrorNote message={weightError} />}
            {weightSaved && (
              <p role="status" className="text-sm text-success">
                Saved.
              </p>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Body weight ({unit})</span>
              <input
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder={unit === "kg" ? "80" : "175"}
                aria-label={`Body weight in ${unit}`}
                className="h-14 rounded-lg border border-border bg-surface px-4 text-xl tabular-nums focus:border-accent focus:outline-none"
              />
            </label>
            <Button
              variant="primary"
              size="md"
              loading={savingWeight}
              onClick={() => void handleSaveWeight()}
            >
              Save body weight
            </Button>
          </Card>

          <Card title="Units">
            {unitError && <ErrorNote message={unitError} />}
            <div
              className="flex rounded-lg border border-border p-0.5"
              role="radiogroup"
              aria-label="Display units"
            >
              {(["kg", "lb"] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => void handleUnitChange(u)}
                  className={`min-h-11 flex-1 rounded-md text-sm transition-colors ${
                    unit === u ? "bg-accent-fill font-medium text-white" : "text-muted"
                  }`}
                >
                  {u === "kg" ? "Kilograms (kg)" : "Pounds (lb)"}
                </button>
              ))}
            </div>
          </Card>

          <Button
            variant="secondary"
            size="md"
            className="w-fit"
            loading={loggingOut}
            onClick={() => {
              setLoggingOut(true);
              void logout().finally(() => setLoggingOut(false));
            }}
          >
            Log out
          </Button>
        </>
      )}
    </div>
  );
}
