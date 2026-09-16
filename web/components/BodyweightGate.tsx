"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BodyweightSheet } from "@/components/BodyweightSheet";
import {
  notifyBodyweightSaved,
  onBodyweightRequired,
} from "@/lib/api/bodyweight-events";

/**
 * App-wide safety net for the missing-bodyweight 422. Mounted once in the
 * authenticated layout: the first `bodyweight_required` failure per session
 * pops the entry sheet; saving notifies every card to auto-retry.
 * Pages additionally render their own inline fix — this never replaces that.
 */
export function BodyweightGate() {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    return onBodyweightRequired(() => {
      if (!shownRef.current) {
        shownRef.current = true;
        setOpen(true);
      }
    });
  }, []);

  const handleSaved = useCallback(() => {
    setOpen(false);
    notifyBodyweightSaved();
  }, []);

  if (!open) return null;
  return <BodyweightSheet onClose={() => setOpen(false)} onSaved={handleSaved} />;
}
