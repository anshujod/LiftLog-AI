"use client";

/** Flat monochrome movement glyphs, one per muscle group.
 * Ink strokes on transparent; single acid accent marks the primary mover.
 * No imagery pipeline, no photos, no new colors. */

const ACCENT = "var(--color-acid)";
const INK = "currentColor";

function Base({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke={INK}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full text-foreground"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const GLYPHS: Record<string, React.ReactNode> = {
  chest: (
    <Base>
      <path d="M8 18h32" />
      <path d="M14 18v6M34 18v6" />
      <rect x="18" y="22" width="12" height="8" stroke={ACCENT} />
      <path d="M24 30v8M18 38h12" />
    </Base>
  ),
  back: (
    <Base>
      <path d="M24 6v10" />
      <path d="M12 10l12-4 12 4" />
      <path d="M14 16c2 8 5 12 10 14" stroke={ACCENT} />
      <path d="M34 16c-2 8-5 12-10 14" stroke={ACCENT} />
      <path d="M20 34h8M22 38h4" />
    </Base>
  ),
  legs: (
    <Base>
      <path d="M18 6h12" />
      <path d="M20 6v12M28 6v12" />
      <path d="M20 18l-3 14M28 18l3 14" stroke={ACCENT} />
      <path d="M14 36h8M26 36h8" />
    </Base>
  ),
  shoulders: (
    <Base>
      <path d="M24 8v8" />
      <circle cx="24" cy="22" r="6" stroke={ACCENT} />
      <path d="M10 30l6-4M38 30l-6-4" />
      <path d="M18 34h12" />
    </Base>
  ),
  biceps: (
    <Base>
      <path d="M14 10c4 0 6 3 6 6v10" />
      <path d="M20 26c0-4 3-6 6-6" stroke={ACCENT} />
      <circle cx="28" cy="18" r="4" stroke={ACCENT} />
      <path d="M14 30h16" />
    </Base>
  ),
  triceps: (
    <Base>
      <path d="M30 8v12" />
      <path d="M30 20c-5 2-8 6-8 12" stroke={ACCENT} />
      <path d="M22 32h10" />
      <path d="M14 12h6" />
    </Base>
  ),
  abs: (
    <Base>
      <rect x="18" y="8" width="12" height="20" stroke={ACCENT} />
      <path d="M18 15h12M18 21h12" />
      <path d="M20 28l-2 10M28 28l2 10" />
    </Base>
  ),
};

export function MovementArt({ slug, label }: { slug: string; label?: string }) {
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center border hairline bg-sunken p-2"
      role="img"
      aria-label={label ? `${label} movement illustration` : "Movement illustration"}
    >
      {GLYPHS[slug] ?? GLYPHS.chest}
    </span>
  );
}
