"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Taller variant for form sheets; default fits pickers/lists. */
  tall?: boolean;
}

/**
 * Single bottom-sheet system: one max-height, drag handle, shared header,
 * backdrop-click + Escape to close, focus moved in and restored on unmount.
 * Dialog labelling stays caller-owned (`title`) so existing accessible names
 * ("Add custom exercise", "Confirm voice-logged sets") don't change.
 */
export function Sheet({ title, onClose, children, footer, tall = false }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previouslyFocusedRef.current instanceof HTMLElement) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`animate-sheet-up relative flex flex-col overflow-y-auto rounded-t-2xl bg-background pb-[env(safe-area-inset-bottom)] outline-none ${
          tall ? "max-h-[90vh]" : "max-h-[85vh]"
        }`}
      >
        <div className="flex shrink-0 flex-col items-center pt-2" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm text-muted"
          >
            Close
          </button>
        </div>
        <div className="flex flex-col gap-4 px-4 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
