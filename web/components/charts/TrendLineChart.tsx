"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  date: string;
  value: number;
  display: string;
}

interface TrendLineChartProps {
  data: TrendPoint[];
  color?: string;
}

interface TrendTooltipProps {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
}

const MAX_TICKS = 6;

function formatTick(iso: string, includeYear = false): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(
    undefined,
    includeYear
      ? { month: "short", day: "numeric", year: "2-digit" }
      : { month: "short", day: "numeric" }
  );
}

/** At most MAX_TICKS evenly-spaced x-axis labels, however many points there are —
 * a phone-width chart turns illegible past ~6 date labels. */
function sampleTicks(dates: string[]): string[] {
  if (dates.length <= MAX_TICKS) return dates;
  const step = (dates.length - 1) / (MAX_TICKS - 1);
  const ticks = Array.from({ length: MAX_TICKS }, (_, i) => dates[Math.round(i * step)]);
  return Array.from(new Set(ticks));
}

function TrendTooltip({
  active,
  payload,
  includeYear = false,
}: TrendTooltipProps & { includeYear?: boolean }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <div className="text-muted">{formatTick(point.date, includeYear)}</div>
      <div className="tabular-nums font-medium">{point.display}</div>
    </div>
  );
}

export function TrendLineChart({ data, color = "var(--color-accent)" }: TrendLineChartProps) {
  const dates = data.map((d) => d.date);
  const ticks = sampleTicks(dates);
  const times = dates.map((d) => new Date(`${d}T00:00:00`).getTime());
  const spanDays =
    times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 86400000 : 0;
  const includeYear = spanDays > 300;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 12 }}>
        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={(iso: string) => formatTick(iso, includeYear)}
          tick={{ fill: "var(--color-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis hide domain={[(min: number) => min * 0.95, (max: number) => max * 1.05]} />
        <Tooltip
          content={<TrendTooltip includeYear={includeYear} />}
          cursor={{ stroke: "var(--color-border)", strokeOpacity: 0.6 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 4, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 8, stroke: "var(--color-surface)" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
