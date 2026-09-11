import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
}

/** Friendly nothing-here-yet block. Copy stays caller-owned so existing
 * strings ("First time logging this one?", "No sessions yet.") don't churn. */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-xl border border-border bg-surface p-4">
      <p className="font-medium">{title}</p>
      {body && <p className="text-sm text-muted">{body}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
