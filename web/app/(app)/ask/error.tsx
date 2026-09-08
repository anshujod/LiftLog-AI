"use client";

import { RouteError } from "@/components/RouteError";

export default function RouteErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      message="This screen hit a snag. Your logged sets are safe — try again."
      reset={reset}
    />
  );
}
