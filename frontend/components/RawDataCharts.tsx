/**
 * RawDataCharts — Layer 1: Cross-Asset Historical Data.
 *
 * Shows raw FRED time-series in a responsive grid.
 * Each mini-chart is a sparkline with the selected-date marker.
 */

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ── Types ──────────────────────────────────────────────────── */

interface SeriesInfo {
  label: string;
  values: (number | null)[];
}

interface RawDataChartsProps {
  dates: string[];
  series: Record<string, SeriesInfo>;
  selectedDate: string | null;
  onDateClick?: (date: string) => void;
}

/* ── Chart colour palette ───────────────────────────────────── */

const COLORS: Record<string, { line: string; fill: string }> = {
  r_spx:          { line: "#3b82f6", fill: "#3b82f620" },
  DGS2:           { line: "#f59e0b", fill: "#f59e0b18" },
  DGS10:          { line: "#ef4444", fill: "#ef444418" },
  vix_level:      { line: "#a855f7", fill: "#a855f718" },
  cs:             { line: "#ec4899", fill: "#ec489918" },
  slope:          { line: "#06b6d4", fill: "#06b6d418" },
  inflation_yoy:  { line: "#22c55e", fill: "#22c55e18" },
  fed_rate:       { line: "#f97316", fill: "#f9731618" },
};

const DEFAULT_COLOR = { line: "#64748b", fill: "#64748b18" };

/* ── Helpers ────────────────────────────────────────────────── */

function fmtDate(d: string | undefined): string {
  if (!d) return "";
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const p = d.split("-");
  return p.length >= 2 ? `${m[parseInt(p[1], 10) - 1]} ${p[0].slice(2)}` : d;
}

const ttStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 10,
};

/* ── Component ──────────────────────────────────────────────── */

export default function RawDataCharts({
  dates,
  series,
  selectedDate,
  onDateClick,
}: RawDataChartsProps) {
  const keys = Object.keys(series);

  /* Build per-series chart data */
  const chartDataMap = useMemo(() => {
    const map: Record<string, { date: string; value: number | null }[]> = {};
    keys.forEach((k) => {
      map[k] = dates.map((d, i) => ({ date: d, value: series[k].values[i] }));
    });
    return map;
  }, [dates, series, keys]);

  if (keys.length === 0) {
    return (
      <div className="text-center text-slate-500 text-sm py-6">
        No cross-asset data loaded yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {keys.map((k) => {
        const info = series[k];
        const colors = COLORS[k] || DEFAULT_COLOR;
        const data = chartDataMap[k];

        return (
          <div
            key={k}
            className="bg-slate-900/60 rounded-xl border border-slate-700/20 p-3 hover:border-slate-600/40 transition-colors"
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 truncate">
              {info.label}
            </div>
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart
                data={data}
                margin={{ top: 2, right: 2, bottom: 0, left: -20 }}
                onClick={(e: any) => {
                  if (e?.activeLabel && onDateClick) onDateClick(e.activeLabel);
                }}
              >
                <defs>
                  <linearGradient id={`fill_${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.line} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={colors.line} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={ttStyle}
                  labelFormatter={(l) => `${l}`}
                  formatter={(v: number) => [v !== null ? v.toFixed(4) : "–", info.label]}
                />
                {selectedDate && (
                  <ReferenceLine x={selectedDate} stroke="#6366f180" strokeWidth={1} />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={colors.line}
                  strokeWidth={1.2}
                  fill={`url(#fill_${k})`}
                  fillOpacity={1}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
            {/* Latest value */}
            {data.length > 0 && data[data.length - 1].value !== null && (
              <div className="text-right text-[10px] font-mono text-slate-400 mt-0.5">
                {data[data.length - 1].value!.toFixed(3)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
