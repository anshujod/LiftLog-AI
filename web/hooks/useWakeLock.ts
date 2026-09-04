"use client";

import { useEffect, useRef } from "react";

/** Holds the screen awake while `active` is true. No-ops silently on browsers
 * without the Wake Lock API, and re-acquires on tab-visibility return since the
 * OS releases the lock automatically when a tab is backgrounded. */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // permission denied / battery saver / unsupported context — degrade silently
      }
    }

    void acquire();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinelRef.current) {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void sentinelRef.current?.release();
      sentinelRef.current = null;
    };
  }, [active]);
}
