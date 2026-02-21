/**
 * CoreCharts — The four central analytics charts.
 *
 * Each chart overlays historical Kalman-estimated data with
 * forward-looking Monte Carlo simulation fan-charts starting
 * from the selected date.
 *
 * Charts:
 *   1. Stress Factor   — historical line + sim fan chart
 *   2. Growth Factor   — historical line + sim fan chart
 *   3. Crisis Probability — sigmoid estimate + sim projection
 *   4. Expected Shortfall — sim ES95 projection
 */

import React, { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ── Types ──────────────────────────────────────────────────── */

export interface StepData {
  step: number;
  H: number;
  stress_fan: { p5: number; p25: number; p50: number; p75: number; p95: number };
  growth_fan: { p5: number; p25: number; p50: number; p75: number; p95: number };
  crisis_prob: number;
  es95_stress: number;
  spaghetti?: { id: number; stress: number }[];
  initial_mu?: number[];
  start_date?: string;
}

export interface TimeseriesData {
  dates: string[];
  series: Record<string, { label: string; values: (number | null)[] }>;
  latent_factors: {
    stress: number[];
    liquidity?: number[];
    growth?: number[];
  };
  regime_labels: string[];
  crisis_probability: number[];
  stress_mean?: number[];
  stress_std?: number[];
}

interface CoreChartsProps {
  timeseries: TimeseriesData | null;
  simulationData: StepData[];
  selectedDate: string | null;
  isRunning: boolean;
  /** Number of most-recent months of history to display */
  historyMonths?: number;
}

/* ── Helpers ────────────────────────────────────────────────── */

/** Add N months to a YYYY-MM-DD string and return YYYY-MM-DD. */
function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(Math.min(d.getDate(), 28)).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Abbreviate date "2024-01-31" → "Jan 24" */
function fmtDate(d: string | undefined): string {
  if (!d) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = d.split("-");
  if (parts.length < 2) return d;
  return `${months[parseInt(parts[1], 10) - 1]} ${parts[0].slice(2)}`;
}

const ttStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  fontSize: 11,
};

/* ── Component ──────────────────────────────────────────────── */

export default function CoreCharts({
  timeseries,
  simulationData,
  selectedDate,
  isRunning,
  historyMonths = 120,
}: CoreChartsProps) {
  const [deviationMode, setDeviationMode] = useState(false);

  // Extract initial mu from first sim step (sent by backend)
  const initialMu = useMemo(() => {
    if (simulationData.length > 0 && simulationData[0].initial_mu) {
      return simulationData[0].initial_mu;
    }
    return null;
  }, [simulationData]);

  /* ── Build combined data: historical + sim ─────────────── */

  const { stressData, growthData, crisisData, es95Data } = useMemo(() => {
    const stress: any[] = [];
    const growth: any[] = [];
    const crisis: any[] = [];
    const es95: any[] = [];

    if (timeseries) {
      const start = Math.max(0, timeseries.dates.length - historyMonths);
      for (let i = start; i < timeseries.dates.length; i++) {
        const idx = i;
        const date = timeseries.dates[idx];
        const s = timeseries.latent_factors.stress[idx] ?? null;
        const g = timeseries.latent_factors.growth?.[idx] ?? null;
        const cp = timeseries.crisis_probability[idx] ?? null;
        const regime = timeseries.regime_labels[idx] ?? "";

        stress.push({ date, hist: s, regime });
        growth.push({ date, hist: g, regime });
        crisis.push({ date, hist: cp !== null ? cp * 100 : null, regime });
        es95.push({ date, regime });
      }
    }

    // Simulation overlay
    if (simulationData.length > 0 && selectedDate) {
      const s0 = initialMu ? initialMu[0] : 0;
      const g0 = initialMu ? (initialMu[2] ?? 0) : 0;

      for (const step of simulationData) {
        const date = addMonths(selectedDate, step.step);
        const dev = deviationMode;

        stress.push({
          date,
          sim_p5:  step.stress_fan.p5  - (dev ? s0 : 0),
          sim_p25: step.stress_fan.p25 - (dev ? s0 : 0),
          sim_p50: step.stress_fan.p50 - (dev ? s0 : 0),
          sim_p75: step.stress_fan.p75 - (dev ? s0 : 0),
          sim_p95: step.stress_fan.p95 - (dev ? s0 : 0),
          isSim: true,
        });

        growth.push({
          date,
          sim_p5:  step.growth_fan.p5  - (dev ? g0 : 0),
          sim_p25: step.growth_fan.p25 - (dev ? g0 : 0),
          sim_p50: step.growth_fan.p50 - (dev ? g0 : 0),
          sim_p75: step.growth_fan.p75 - (dev ? g0 : 0),
          sim_p95: step.growth_fan.p95 - (dev ? g0 : 0),
          isSim: true,
        });

        crisis.push({
          date,
          sim: step.crisis_prob * 100,
          isSim: true,
        });

        es95.push({
          date,
          sim: step.es95_stress,
          isSim: true,
        });
      }
    }

    // Sort by date
    const cmpDate = (a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    stress.sort(cmpDate);
    growth.sort(cmpDate);
    crisis.sort(cmpDate);
    es95.sort(cmpDate);

    return { stressData: stress, growthData: growth, crisisData: crisis, es95Data: es95 };
  }, [timeseries, simulationData, selectedDate, deviationMode, initialMu, historyMonths]);

  /* ── Spaghetti paths (stress only, first 20) ──────────── */
  const spaghettiKeys = useMemo(() => {
    if (simulationData.length === 0) return [];
    const n = Math.min(simulationData[0]?.spaghetti?.length ?? 0, 20);
    return Array.from({ length: n }, (_, i) => `sp_${i}`);
  }, [simulationData]);

  // Augment stress data with spaghetti values
  const stressWithSpaghetti = useMemo(() => {
    if (spaghettiKeys.length === 0 || !selectedDate) return stressData;
    const s0 = deviationMode && initialMu ? initialMu[0] : 0;

    // Build a map of step → spaghetti values
    const spagMap = new Map<number, Record<string, number>>();
    for (const step of simulationData) {
      const row: Record<string, number> = {};
      step.spaghetti?.forEach((s, i) => {
        if (i < spaghettiKeys.length) row[spaghettiKeys[i]] = s.stress - s0;
      });
      spagMap.set(step.step, row);
    }

    return stressData.map((d: any) => {
      if (!d.isSim) return d;
      // Find step number from date
      const monthsAfter = stressData.filter((x: any) => x.isSim && x.date <= d.date).length;
      const spag = spagMap.get(monthsAfter) || {};
      return { ...d, ...spag };
    });
  }, [stressData, simulationData, spaghettiKeys, selectedDate, deviationMode, initialMu]);

  /* ── Sim progress ─────────────────────────────────────── */
  const lastStep = simulationData.length > 0 ? simulationData[simulationData.length - 1] : null;
  const simH = lastStep?.H ?? 24;

  /* ── No data placeholder ──────────────────────────────── */
  if (!timeseries && simulationData.length === 0) {
    return (
      <div className="flex items-center justify-center h-80 text-slate-500">
        <div className="text-center space-y-2">
          <p className="text-4xl opacity-30">📈</p>
          <p className="text-sm">Click <span className="text-indigo-400 font-medium">Refresh</span> to load data</p>
        </div>
      </div>
    );
  }

  /* ── Custom tick formatter ────────────────────────────── */
  const dateTick = (value: string) => fmtDate(value);

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Core Analytics
          </h2>
          {isRunning && (
            <span className="text-[10px] bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded animate-pulse">
              SIMULATING
            </span>
          )}
          {simulationData.length > 0 && (
            <span className="text-[10px] text-slate-500">
              Step {lastStep?.step ?? 0}/{simH}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeviationMode(!deviationMode)}
            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
              deviationMode
                ? "bg-indigo-900/40 text-indigo-300 border-indigo-600/40"
                : "bg-slate-800/40 text-slate-500 border-slate-700/30 hover:text-slate-300"
            }`}
          >
            {deviationMode ? "Δ Deviation Mode" : "Absolute Mode"}
          </button>
        </div>
      </div>

      {/* 2×2 chart grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* ─── STRESS FACTOR ─────────────────────────────── */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/30 p-4">
          <h3 className="text-[10px] font-bold text-red-400/80 uppercase tracking-wider mb-1">
            Stress Factor {deviationMode ? "(Δ from start)" : ""}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={stressWithSpaghetti} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="stressOuter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.18} />
                </linearGradient>
                <linearGradient id="stressInner" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} interval="preserveStartEnd" minTickGap={40} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(l) => `${l}`} />
              {/* Selected date marker */}
              {selectedDate && <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />}
              {deviationMode && <ReferenceLine y={0} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />}
              {/* Historical line */}
              <Line type="monotone" dataKey="hist" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Historical Stress" connectNulls={false} isAnimationActive={false} />
              {/* Sim outer band */}
              <Area type="monotone" dataKey="sim_p95" stroke="none" fill="url(#stressOuter)" fillOpacity={1} name="p95" isAnimationActive={false} />
              <Area type="monotone" dataKey="sim_p5" stroke="none" fill="#0f172a" fillOpacity={0} name="p5" isAnimationActive={false} />
              {/* Sim inner band */}
              <Area type="monotone" dataKey="sim_p75" stroke="none" fill="url(#stressInner)" fillOpacity={1} name="p75" isAnimationActive={false} />
              <Area type="monotone" dataKey="sim_p25" stroke="none" fill="#0f172a" fillOpacity={0} name="p25" isAnimationActive={false} />
              {/* Sim median */}
              <Line type="monotone" dataKey="sim_p50" stroke="#ef4444" strokeWidth={2.5} dot={false} name="Sim Median" isAnimationActive={false} />
              {/* Spaghetti */}
              {spaghettiKeys.slice(0, 15).map((k, idx) => (
                <Line key={k} type="monotone" dataKey={k} stroke={`hsla(${(idx * 25) % 360}, 55%, 55%, 0.12)`} strokeWidth={0.5} dot={false} isAnimationActive={false} legendType="none" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ─── GROWTH FACTOR ─────────────────────────────── */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/30 p-4">
          <h3 className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider mb-1">
            Growth Factor {deviationMode ? "(Δ from start)" : ""}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={growthData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="growthOuter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.18} />
                </linearGradient>
                <linearGradient id="growthInner" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} interval="preserveStartEnd" minTickGap={40} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(l) => `${l}`} />
              {selectedDate && <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />}
              {deviationMode && <ReferenceLine y={0} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />}
              <Line type="monotone" dataKey="hist" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Historical Growth" connectNulls={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="sim_p95" stroke="none" fill="url(#growthOuter)" fillOpacity={1} name="p95" isAnimationActive={false} />
              <Area type="monotone" dataKey="sim_p5" stroke="none" fill="#0f172a" fillOpacity={0} name="p5" isAnimationActive={false} />
              <Area type="monotone" dataKey="sim_p75" stroke="none" fill="url(#growthInner)" fillOpacity={1} name="p75" isAnimationActive={false} />
              <Area type="monotone" dataKey="sim_p25" stroke="none" fill="#0f172a" fillOpacity={0} name="p25" isAnimationActive={false} />
              <Line type="monotone" dataKey="sim_p50" stroke="#22c55e" strokeWidth={2.5} dot={false} name="Sim Median" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ─── CRISIS PROBABILITY ────────────────────────── */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/30 p-4">
          <h3 className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider mb-1">
            Crisis Probability (%)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={crisisData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} interval="preserveStartEnd" minTickGap={40} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} domain={[0, 100]} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(l) => `${l}`} formatter={(v: number) => `${v?.toFixed(1)}%`} />
              {selectedDate && <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />}
              <Line type="monotone" dataKey="hist" stroke="#f59e0b" strokeWidth={1.2} dot={false} name="Historical Est." connectNulls={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="sim" stroke="#ef4444" strokeWidth={2.5} dot={false} name="Simulated" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ─── EXPECTED SHORTFALL ────────────────────────── */}
        <div className="bg-slate-900/80 rounded-xl border border-slate-700/30 p-4">
          <h3 className="text-[10px] font-bold text-purple-400/80 uppercase tracking-wider mb-1">
            Expected Shortfall (ES95)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={es95Data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} interval="preserveStartEnd" minTickGap={40} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={ttStyle} labelFormatter={(l) => `${l}`} />
              {selectedDate && <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />}
              <Line type="monotone" dataKey="sim" stroke="#a855f7" strokeWidth={2.5} dot={false} name="ES95 Stress" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary stats */}
      {lastStep && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Stress p50", value: lastStep.stress_fan.p50.toFixed(3), color: "text-red-400" },
            { label: "Growth p50", value: lastStep.growth_fan.p50.toFixed(3), color: "text-emerald-400" },
            { label: "Crisis Prob", value: `${(lastStep.crisis_prob * 100).toFixed(1)}%`, color: lastStep.crisis_prob > 0.3 ? "text-red-400" : "text-amber-400" },
            { label: "ES95", value: lastStep.es95_stress.toFixed(3), color: "text-purple-400" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/60 rounded-lg p-2.5 text-center border border-slate-700/20">
              <div className="text-[10px] text-slate-500">{s.label}</div>
              <div className={`text-sm font-mono font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
