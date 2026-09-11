"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface BarPoint {
  label: string;
  value: number;
  display: string;
}

interface SimpleBarChartProps {
  data: BarPoint[];
  color?: string;
}

interface BarTooltipProps {
  active?: boolean;
  payload?: { payload: BarPoint }[];
}

const MAX_TICKS = 6;

function truncateLabel(label: string): string {
  return label.length > 10 ? `${label.slice(0, 10)}…` : label;
}

function BarTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg">
      <div className="text-muted">{point.label}</div>
      <div className="tabular-nums font-medium">{point.display}</div>
    </div>
  );
}

export function SimpleBarChart({ data, color = "var(--color-accent)" }: SimpleBarChartProps) {
  const interval = data.length > MAX_TICKS ? Math.ceil(data.length / MAX_TICKS) - 1 : 0;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.5} />
        <XAxis
          dataKey="label"
          interval={interval}
          tickFormatter={truncateLabel}
          tick={{ fill: "var(--color-muted)", fontSize: 11 }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip content={<BarTooltip />} cursor={{ fill: "var(--color-border)", opacity: 0.45 }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} minPointSize={3} />
      </BarChart>
    </ResponsiveContainer>
  );
}
