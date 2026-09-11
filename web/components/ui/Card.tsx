import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Single card system: rounded-xl, bordered surface, micro-caps title. */
export function Card({ title, action, children, className = "" }: CardProps) {
  return (
    <section className={`flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
