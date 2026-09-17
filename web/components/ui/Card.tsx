import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Grouped surface — reserved for frames with a shared action
 * (completion summary, coach evidence, muscle hero).
 * Everything else is editorial whitespace + type, no chrome.
 */
export function Card({ title, action, children, className = "" }: CardProps) {
  return (
    <section className={`flex flex-col gap-3 rounded-[2px] border hairline bg-surface p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <h2 className="eyebrow">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
