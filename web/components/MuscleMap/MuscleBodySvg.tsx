"use client";

import { fillFor, recoveryFillFor, type IntensityLevel, type RecoveryStatus } from "./muscleMeta";

export type BodyView = "front" | "back";
export type BodyPaint = "intensity" | "recovery";

interface MuscleBodySvgProps {
  view: BodyView;
  intensity: Record<string, IntensityLevel>;
  selected: string | null;
  onSelect: (slug: string) => void;
  compact?: boolean;
  /** Recovery mode paints Ready/Recovering/Rest hues instead of intensity. */
  paint?: BodyPaint;
  recovery?: Record<string, RecoveryStatus>;
}

/** Neutral tone for head, hands, feet — never lit by training data. */
const NEUTRAL_FILL = "#2a2d2a";

interface MuscleProps {
  slug: string;
  label: string;
  stateLabel: string;
  fill: string;
  fillOpacity: number;
  selected: boolean;
  onSelect: (slug: string) => void;
  children: React.ReactNode;
}

/** One tappable muscle region: 44px+ touch area via the shapes + keyboard access. */
function Muscle({
  slug,
  label,
  stateLabel,
  fill,
  fillOpacity,
  selected,
  onSelect,
  children,
}: MuscleProps) {
  return (
    <g
      data-muscle={slug}
      role="button"
      tabIndex={0}
      aria-label={`${label}, ${stateLabel}`}
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
      <title>{`${label} — ${stateLabel}`}</title>
      <g
        fill={fill}
        fillOpacity={fillOpacity}
        // Dark gaps delineate muscle bellies (anatomical-illustration look);
        // trained regions keep their hue, selected gets a white ring.
        stroke={selected ? "#fff" : "var(--color-background)"}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeLinejoin="round"
      >
        {children}
      </g>
    </g>
  );
}

/** Render left-half artwork on both sides (viewBox is 140 wide, midline x=70). */
function BothSides({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <g transform="translate(140 0) scale(-1 1)">{children}</g>
    </>
  );
}

function BaseFigure({ view }: { view: BodyView }) {
  // Neutral silhouette underneath the muscles: head, neck, limbs.
  return (
    <g aria-hidden="true" fill="var(--color-surface-raised)" stroke="var(--color-border)" strokeWidth={1.5}>
      <circle cx={70} cy={20} r={13} fill={NEUTRAL_FILL} />
      <rect x={62} y={32} width={16} height={10} rx={3} />
      {/* arms */}
      <rect x={20} y={50} width={15} height={100} rx={7.5} />
      <rect x={105} y={50} width={15} height={100} rx={7.5} />
      {/* hands */}
      <ellipse cx={27.5} cy={157} rx={7} ry={10} fill={NEUTRAL_FILL} />
      <ellipse cx={112.5} cy={157} rx={7} ry={10} fill={NEUTRAL_FILL} />
      {/* legs */}
      <rect x={46} y={172} width={21} height={112} rx={10} />
      <rect x={73} y={172} width={21} height={112} rx={10} />
      {/* feet */}
      <path d="M48 282 H66 Q68 287 65 290 H49 Q46 287 48 282 Z" fill={NEUTRAL_FILL} />
      <path d="M92 282 H74 Q72 287 75 290 H91 Q94 287 92 282 Z" fill={NEUTRAL_FILL} />
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

/** Thin segmentation strokes (ab rows, quad sweep, calf split). Decorative only. */
function DetailLines({ view }: { view: BodyView }) {
  const stroke = "var(--color-background)";
  if (view === "front") {
    return (
      <g aria-hidden="true" stroke={stroke} strokeWidth={1}>
        <line x1={59} y1={110} x2={81} y2={110} />
        <line x1={59} y1={123} x2={81} y2={123} />
        <line x1={59} y1={136} x2={81} y2={136} />
        <line x1={70} y1={97} x2={70} y2={149} />
        <line x1={52} y1={190} x2={62} y2={228} />
        <line x1={88} y1={190} x2={78} y2={228} />
      </g>
    );
  }
  return (
    <g aria-hidden="true" stroke={stroke} strokeWidth={1}>
      <line x1={70} y1={108} x2={70} y2={140} />
      <line x1={54} y1={200} x2={57} y2={232} />
      <line x1={86} y1={200} x2={83} y2={232} />
      <line x1={57} y1={248} x2={57} y2={272} />
      <line x1={83} y1={248} x2={83} y2={272} />
    </g>
  );
}

const INTENSITY_STATE_LABEL: Record<IntensityLevel, string> = {
  0: "not trained this period",
  1: "trained, light",
  2: "trained, moderate",
  3: "trained, high",
};

export function MuscleBodySvg({
  view,
  intensity,
  selected,
  onSelect,
  compact = false,
  paint = "intensity",
  recovery,
}: MuscleBodySvgProps) {
  const isSel = (slug: string) => selected === slug;

  function paintFor(slug: string): { fill: string; fillOpacity: number; stateLabel: string } {
    if (paint === "recovery") {
      const status = recovery?.[slug] as RecoveryStatus | undefined;
      const { fill, fillOpacity } = recoveryFillFor(status);
      return { fill, fillOpacity, stateLabel: status ?? "no data" };
    }
    const level = (intensity[slug] ?? 0) as IntensityLevel;
    const { fill, fillOpacity } = fillFor(slug, level);
    return { fill, fillOpacity, stateLabel: INTENSITY_STATE_LABEL[level] };
  }

  function muscle(slug: string, label: string, children: React.ReactNode) {
    const p = paintFor(slug);
    return (
      <Muscle
        slug={slug}
        label={label}
        stateLabel={p.stateLabel}
        fill={p.fill}
        fillOpacity={p.fillOpacity}
        selected={isSel(slug)}
        onSelect={onSelect}
      >
        {children}
      </Muscle>
    );
  }

  return (
    <svg
      viewBox="0 0 140 300"
      role="img"
      aria-label={view === "front" ? "Front body muscle map" : "Back body muscle map"}
      className={compact ? "h-28 w-auto" : "h-64 w-auto sm:h-72"}
    >
      <BaseFigure view={view} />

      {/* Shoulders — visible in both views (front/lateral delt front, rear delt back) */}
      {muscle(
        "shoulders",
        "Shoulders",
        <BothSides>
          <path d="M29 54 Q30 47 38 46 L45 48 Q49 53 47 61 L44 68 Q36 71 31 65 Z" />
          <path d="M62 43 L50 49 L59 57 Z" />
        </BothSides>
      )}

      {view === "front" ? (
        <>
          {muscle(
            "chest",
            "Chest",
            <BothSides>
              <path d="M46 59 H69 Q70 59 70 62 V74 Q70 83 61 87 L51 91 Q45 89 44 81 L43 63 Q43 59 46 59 Z" />
            </BothSides>
          )}
          {muscle(
            "biceps",
            "Biceps",
            <BothSides>
              <ellipse cx={25} cy={89} rx={7} ry={15} />
              <path d="M19 107 H29 Q31 123 27 139 L23 141 Q18 125 19 107 Z" />
            </BothSides>
          )}
          {muscle(
            "abs",
            "Abs",
            <>
              <rect x={58} y={96} width={24} height={54} rx={7} />
              <BothSides>
                <path d="M50 99 Q55 103 55 128 L53 147 Q49 138 48 117 Z" />
              </BothSides>
            </>
          )}
          {muscle(
            "legs",
            "Legs",
            <BothSides>
              <path d="M48 173 H67 Q69 173 69 179 V218 Q69 233 61 239 L56 243 Q49 239 48 227 Z" />
              <path d="M52 246 H61 Q63 261 60 275 L57 279 Q52 271 51 258 Z" />
            </BothSides>
          )}
        </>
      ) : (
        <>
          {muscle(
            "back",
            "Back",
            <>
              <path d="M58 43 H82 L75 62 H65 Z" />
              <BothSides>
                <path d="M47 63 Q59 68 59 108 L57 133 Q49 119 45 95 Z" />
              </BothSides>
              <rect x={59} y={108} width={22} height={32} rx={5} />
            </>
          )}
          {muscle(
            "triceps",
            "Triceps",
            <BothSides>
              <ellipse cx={25} cy={89} rx={7} ry={15} />
              <path d="M19 107 H29 Q31 123 27 139 L23 141 Q18 125 19 107 Z" />
            </BothSides>
          )}
          {muscle(
            "legs",
            "Legs",
            <BothSides>
              <path d="M49 145 H68 Q70 168 62 177 L55 179 Q48 170 49 145 Z" />
              <path d="M49 183 H65 V224 Q64 236 58 238 Q51 234 50 222 Z" />
              <ellipse cx={54} cy={257} rx={5.5} ry={15} />
              <ellipse cx={61} cy={257} rx={5} ry={14} />
            </BothSides>
          )}
        </>
      )}

      <DetailLines view={view} />
    </svg>
  );
}
