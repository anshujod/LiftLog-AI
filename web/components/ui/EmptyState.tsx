import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

/** Borderless nothing-here-yet block. Copy stays caller-owned. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-1 py-2">
      <p className="font-semibold">{title}</p>
      {body && <p className="text-sm text-muted">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
