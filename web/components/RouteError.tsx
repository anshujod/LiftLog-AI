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
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="max-w-xs text-sm text-muted">{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="h-11 rounded-xl bg-accent px-5 text-sm font-medium text-white"
        >
          Try again
        </button>
        <Link
          href="/"
          className="flex h-11 items-center rounded-xl border border-border px-5 text-sm font-medium"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
