import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Default content grouping: eyebrow header + content, no surface.
 * Prefer over Card — cards are reserved for frames with a shared action.
 */
export function Section({ title, action, children, className = "" }: SectionProps) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2 border-b hairline pb-2">
        <h2 className="eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
