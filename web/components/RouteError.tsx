"use client";

import Link from "next/link";

/**
 * Shared fallback for every route error boundary. Rendered when a page
 * throws during render or data loading — a failed AI call or API hiccup
 * must never leave a blank screen.
 */
export function RouteError({
  message,
  reset,
}: {
  message: string;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p className="eyebrow">Something went wrong</p>
      <p className="font-display text-3xl">Interrupted.</p>
      <p className="max-w-xs text-sm text-muted">{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="slab-press h-12 rounded-[2px] bg-acid px-6 font-display text-base tracking-wide text-background"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex h-12 items-center rounded-[2px] border hairline px-5 text-sm font-medium"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
