"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  week: string;
  partial: boolean;
  value: number | null;
}

interface ChartRow extends TrendPoint {
  full: number | null;
  bridge: number | null;
}

const shortDate = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
};

/** Partial weeks are drawn dashed so they cannot be read as a real change. */
export function toChartRows(points: TrendPoint[]): ChartRow[] {
  const lastFull = points.reduce((last, point, index) => (!point.partial && point.value !== null ? index : last), -1);
  return points.map((point, index) => ({
    ...point,
    full: point.partial ? null : point.value,
    bridge: point.partial || index === lastFull ? point.value : null,
  }));
}

function TrendTooltip({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartRow }[];
  format: (value: number) => string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="border border-line bg-surface px-2 py-1 text-xs text-ink shadow-sm">
      <div className="text-ink-2">
        Week of {shortDate(row.week)}
        {row.partial ? " (partial)" : ""}
      </div>
      <div className="font-medium tabular-nums">{row.value === null ? "No data" : format(row.value)}</div>
    </div>
  );
}

export default function TrendChart({
  points,
  format,
  axisFormat = format,
  domain,
  height = 150,
  label,
}: {
  points: TrendPoint[];
  format: (value: number) => string;
  axisFormat?: (value: number) => string;
  domain?: [number, number];
  height?: number;
  label: string;
}) {
  const rows = toChartRows(points);
  return (
    <div role="img" aria-label={`${label}, weekly line chart. Exact values are in the data table.`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            dataKey="week"
            tickFormatter={shortDate}
            tick={{ fill: "var(--ink-2)", fontSize: 11 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            width={44}
            domain={domain ?? [0, "auto"]}
            tickFormatter={(value: number) => axisFormat(value)}
            tick={{ fill: "var(--ink-2)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip
            cursor={{ stroke: "var(--ink-3)", strokeWidth: 1 }}
            content={(props) => (
              <TrendTooltip
                active={props.active}
                payload={props.payload as readonly { payload?: ChartRow }[] | undefined}
                format={format}
              />
            )}
          />
          <Line
            type="linear"
            dataKey="full"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="bridge"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
            legendType="none"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
