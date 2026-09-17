"use client";

import type { ReactNode } from "react";

interface SegmentedProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  renderLabel?: (value: T) => ReactNode;
}

/** Square segmented control. Replaces rounded pill tab groups. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  renderLabel,
}: SegmentedProps<T>) {
  return (
    <div className="flex border hairline" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={`min-h-11 flex-1 px-4 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
              active ? "bg-acid text-background" : "text-muted"
            }`}
          >
            {renderLabel ? renderLabel(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}
