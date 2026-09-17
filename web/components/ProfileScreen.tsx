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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-10 pt-4 md:max-w-3xl">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Settings</p>
        <h1 className="text-[28px] font-semibold tracking-tight">Profile</h1>
      </div>

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
          <section className="flex flex-col gap-1 border-t hairline pt-4">
            <h2 className="eyebrow">Account</h2>
            <p className="truncate text-[16px]">{me.email}</p>
            <p className="text-[13px] text-muted">
              {unit} · {me.bodyweight_g !== null ? "Bodyweight saved" : "Add bodyweight for calisthenics"}
            </p>
          </section>

          <section className="flex flex-col gap-3 border-t hairline pt-4">
            <h2 className="eyebrow">Bodyweight</h2>
            <p className="max-w-md text-sm text-muted">
              Needed for pull-ups, dips and assisted work — volume and records can&apos;t be
              computed without it.
            </p>
            {weightError && <ErrorNote message={weightError} />}
            {weightSaved && (
              <p role="status" className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                Saved.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Body weight ({unit})</span>
                <input
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={unit === "kg" ? "80" : "175"}
                  aria-label={`Body weight in ${unit}`}
                  className="h-12 w-40 rounded-[2px] border hairline bg-sunken px-4 text-xl tabular-nums outline-none focus:border-acid"
                />
              </label>
              <Button
                variant="primary"
                size="md"
                className="w-fit"
                loading={savingWeight}
                onClick={() => void handleSaveWeight()}
              >
                Save body weight
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t hairline pt-4">
            <h2 className="eyebrow">Units</h2>
            {unitError && <ErrorNote message={unitError} />}
            <div
              className="flex max-w-xs border hairline"
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
                  className={`min-h-[52px] flex-1 px-4 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                    unit === u ? "bg-acid text-background" : "text-muted"
                  }`}
                >
                  {u === "kg" ? "Kilograms (kg)" : "Pounds (lb)"}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2 border-t hairline pt-4">
            <h2 className="eyebrow">Account</h2>
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
          </section>
        </>
      )}
    </div>
  );
}
