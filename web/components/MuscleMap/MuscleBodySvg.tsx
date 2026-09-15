"use client";

import type { IntensityLevel } from "./muscleMeta";

export type BodyView = "front" | "back";

interface MuscleBodySvgProps {
  view: BodyView;
  intensity: Record<string, IntensityLevel>;
  selected: string | null;
  onSelect: (slug: string) => void;
  compact?: boolean;
}

function fillFor(level: IntensityLevel | undefined): { fill: string; fillOpacity: number } {
  switch (level) {
    case 1:
      return { fill: "var(--color-accent-fill)", fillOpacity: 0.35 };
    case 2:
      return { fill: "var(--color-accent-fill)", fillOpacity: 0.65 };
    case 3:
      return { fill: "var(--color-accent-fill)", fillOpacity: 1 };
    default:
      return { fill: "var(--color-surface-raised)", fillOpacity: 1 };
  }
}

interface MuscleProps {
  slug: string;
  label: string;
  level: IntensityLevel | undefined;
  selected: boolean;
  onSelect: (slug: string) => void;
  children: React.ReactNode;
}

/** One tappable muscle region: 44px+ touch area via the shapes + keyboard access. */
function Muscle({ slug, label, level, selected, onSelect, children }: MuscleProps) {
  const { fill, fillOpacity } = fillFor(level);
  const trained = (level ?? 0) > 0;
  return (
    <g
      data-muscle={slug}
      role="button"
      tabIndex={0}
      aria-label={`${label}, ${trained ? `trained, level ${level}` : "not trained this period"}`}
      aria-pressed={selected}
      onClick={() => onSelect(slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(slug);
        }
      }}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <title>{`${label}${trained ? ` — level ${level}` : " — not trained"}`}</title>
      <g
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={selected ? "#fff" : trained ? "var(--color-accent)" : "var(--color-border)"}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeLinejoin="round"
      >
        {children}
      </g>
    </g>
  );
}

function BaseFigure({ view }: { view: BodyView }) {
  // Neutral silhouette underneath the muscles: head, neck, limbs.
  return (
    <g aria-hidden="true" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth={1.5}>
      <circle cx={70} cy={20} r={13} />
      <rect x={62} y={32} width={16} height={10} rx={3} />
      {/* arms */}
      <rect x={20} y={50} width={15} height={100} rx={7.5} />
      <rect x={105} y={50} width={15} height={100} rx={7.5} />
      {/* legs */}
      <rect x={46} y={172} width={21} height={112} rx={10} />
      <rect x={73} y={172} width={21} height={112} rx={10} />
      {/* torso base */}
      <path d="M40 48 H100 L95 140 L91 174 H49 L45 140 Z" />
      {view === "front" ? (
        <text x={70} y={292} textAnchor="middle" fontSize={10} fill="var(--color-muted)" stroke="none">
          FRONT
        </text>
      ) : (
        <text x={70} y={292} textAnchor="middle" fontSize={10} fill="var(--color-muted)" stroke="none">
          BACK
        </text>
      )}
    </g>
  );
}

export function MuscleBodySvg({ view, intensity, selected, onSelect, compact = false }: MuscleBodySvgProps) {
  const level = (slug: string) => intensity[slug] as IntensityLevel | undefined;
  const isSel = (slug: string) => selected === slug;

  return (
    <svg
      viewBox="0 0 140 300"
      role="img"
      aria-label={view === "front" ? "Front body muscle map" : "Back body muscle map"}
      className={compact ? "h-28 w-auto" : "h-64 w-auto sm:h-72"}
    >
      <BaseFigure view={view} />

      {/* Shoulders — visible in both views */}
      <Muscle slug="shoulders" label="Shoulders" level={level("shoulders")} selected={isSel("shoulders")} onSelect={onSelect}>
        <ellipse cx={31} cy={54} rx={12} ry={10} />
        <ellipse cx={109} cy={54} rx={12} ry={10} />
      </Muscle>

      {view === "front" ? (
        <>
          <Muscle slug="chest" label="Chest" level={level("chest")} selected={isSel("chest")} onSelect={onSelect}>
            <path d="M45 62 H68 V84 L50 96 L44 80 Z" />
            <path d="M95 62 H72 V84 L90 96 L96 80 Z" />
          </Muscle>
          <Muscle slug="biceps" label="Biceps" level={level("biceps")} selected={isSel("biceps")} onSelect={onSelect}>
            <ellipse cx={27.5} cy={98} rx={8} ry={20} />
            <ellipse cx={112.5} cy={98} rx={8} ry={20} />
          </Muscle>
          <Muscle slug="abs" label="Abs" level={level("abs")} selected={isSel("abs")} onSelect={onSelect}>
            <rect x={59} y={100} width={22} height={56} rx={7} />
          </Muscle>
          {/* ab segmentation lines (decorative, inherit no extra fill) */}
          <g aria-hidden="true" stroke="var(--color-border)" strokeWidth={1}>
            <line x1={59} y1={114} x2={81} y2={114} />
            <line x1={59} y1={128} x2={81} y2={128} />
            <line x1={59} y1={142} x2={81} y2={142} />
          </g>
          <Muscle slug="legs" label="Legs" level={level("legs")} selected={isSel("legs")} onSelect={onSelect}>
            <rect x={48} y={178} width={18} height={58} rx={8} />
            <rect x={74} y={178} width={18} height={58} rx={8} />
            <rect x={50} y={240} width={14} height={38} rx={7} />
            <rect x={76} y={240} width={14} height={38} rx={7} />
          </Muscle>
        </>
      ) : (
        <>
          <Muscle slug="back" label="Back" level={level("back")} selected={isSel("back")} onSelect={onSelect}>
            <path d="M58 46 H82 L74 68 H66 Z" />
            <path d="M46 62 H94 L89 136 H51 Z" />
          </Muscle>
          <Muscle slug="triceps" label="Triceps" level={level("triceps")} selected={isSel("triceps")} onSelect={onSelect}>
            <ellipse cx={27.5} cy={98} rx={8} ry={20} />
            <ellipse cx={112.5} cy={98} rx={8} ry={20} />
          </Muscle>
          <Muscle slug="legs" label="Legs" level={level("legs")} selected={isSel("legs")} onSelect={onSelect}>
            <rect x={49} y={148} width={19} height={28} rx={9} />
            <rect x={72} y={148} width={19} height={28} rx={9} />
            <rect x={48} y={180} width={18} height={56} rx={8} />
            <rect x={74} y={180} width={18} height={56} rx={8} />
            <rect x={50} y={240} width={14} height={38} rx={7} />
            <rect x={76} y={240} width={14} height={38} rx={7} />
          </Muscle>
        </>
      )}
    </svg>
  );
}
