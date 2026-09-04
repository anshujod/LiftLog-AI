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

function formatTick(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** At most MAX_TICKS evenly-spaced x-axis labels, however many points there are —
 * a phone-width chart turns illegible past ~6 date labels. */
function sampleTicks(dates: string[]): string[] {
  if (dates.length <= MAX_TICKS) return dates;
  const step = (dates.length - 1) / (MAX_TICKS - 1);
  const ticks = Array.from({ length: MAX_TICKS }, (_, i) => dates[Math.round(i * step)]);
  return Array.from(new Set(ticks));
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <div className="text-muted">{formatTick(point.date)}</div>
      <div className="tabular-nums font-medium">{point.display}</div>
    </div>
  );
}

export function TrendLineChart({ data, color = "var(--color-accent)" }: TrendLineChartProps) {
  const ticks = sampleTicks(data.map((d) => d.date));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
        <XAxis
          dataKey="date"
          ticks={ticks}
          tickFormatter={formatTick}
          tick={{ fill: "var(--color-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis hide domain={[(min: number) => min * 0.95, (max: number) => max * 1.05]} />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--color-border)" }} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
