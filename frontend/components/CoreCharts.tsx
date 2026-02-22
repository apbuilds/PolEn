/**
 * CoreCharts — The four central analytics charts.
 *
 * Behavior:
 *   - Default: displays full historical data
 *   - After simulation: trims history right of start date,
 *     shifts time scale to sim window, overlays sim curves
 *   - Supports multi-agent overlay from agent comparison
 *
 * Charts:
 *   1. Stress Factor   — historical line + sim fan chart + agent paths
 *   2. Growth Factor   — historical line + sim fan chart + agent paths
 *   3. Crisis Probability — historical + sim/agent projections
 *   4. Expected Shortfall — sim/agent ES95 projections
 */

import React, { useMemo, useState } from "react";
import {
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Line,
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

export interface AgentResult {
  agent: string;
  label: string;
  delta_bps: number;
  error?: string;
  metrics: {
    mean_stress: number;
    mean_growth_penalty: number;
    mean_es95: number;
    crisis_end: number;
    total_loss: number;
  };
  crisis_prob_path: number[];
  stress_path: number[];
  growth_path: number[];
  stress_fan: Record<string, number>[];
  growth_fan: Record<string, number>[];
}

interface CoreChartsProps {
  timeseries: TimeseriesData | null;
  simulationData: StepData[];
  selectedDate: string | null;
  isRunning: boolean;
  /** Number of most-recent months of history to display */
  historyMonths?: number;
  /** Agent comparison results for multi-agent overlay */
  agentResults?: Record<string, AgentResult> | null;
}

/* ── Constants ──────────────────────────────────────────────── */

const AGENT_COLORS: Record<string, string> = {
  heuristic: "#10b981",
  rl: "#a855f7",
  historical: "#f59e0b",
  custom: "#3b82f6",
};

const AGENT_LABELS: Record<string, string> = {
  heuristic: "Heuristic",
  rl: "RL Agent",
  historical: "Historical Fed",
  custom: "Custom",
};

/* ── Helpers ────────────────────────────────────────────────── */

/** Compute end-of-month date N months after a YYYY-MM-DD string. */
function addMonthsEnd(dateStr: string, n: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const lastDay = new Date(newYear, newMonth, 0).getDate();
  return `${newYear}-${String(newMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Abbreviate date "2024-01-31" -> "Jan 24" */
function fmtDate(d: string | undefined): string {
  if (!d) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parts = d.split("-");
  if (parts.length < 2) return d;
  return `${months[parseInt(parts[1], 10) - 1]} ${parts[0].slice(2)}`;
}

/** Pick evenly-spaced date ticks from a sorted date array. */
function computeTimeTicks(data: { date: string }[], targetCount: number = 8): string[] {
  const dates = data.map((d) => d.date).filter(Boolean);
  if (dates.length <= targetCount) return dates;

  // Compute total span in months
  const first = dates[0];
  const last = dates[dates.length - 1];
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const totalMonths = (ly - fy) * 12 + (lm - fm);

  // Choose interval: aim for targetCount ticks
  const intervalMonths = Math.max(1, Math.round(totalMonths / (targetCount - 1)));

  const ticks: string[] = [first];
  let lastY = fy;
  let lastM = fm;

  for (const d of dates) {
    const [cy, cm] = d.split("-").map(Number);
    const diff = (cy - lastY) * 12 + (cm - lastM);
    if (diff >= intervalMonths) {
      ticks.push(d);
      lastY = cy;
      lastM = cm;
    }
  }

  // Always include last
  if (ticks[ticks.length - 1] !== last) {
    ticks.push(last);
  }
  return ticks;
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
  agentResults,
}: CoreChartsProps) {
  const [deviationMode, setDeviationMode] = useState(false);

  const simActive = simulationData.length > 0;
  const agentsActive = agentResults != null && Object.keys(agentResults).length > 0;
  const hasOverlay = simActive || agentsActive;

  // Initial mu from first sim step
  const initialMu = useMemo(() => {
    if (simulationData.length > 0 && simulationData[0].initial_mu) {
      return simulationData[0].initial_mu;
    }
    return null;
  }, [simulationData]);

  /* ── Build combined chart data ─────────────────────────── */

  const { stressData, growthData, crisisData, es95Data, agentKeys } = useMemo(() => {
    const stress: any[] = [];
    const growth: any[] = [];
    const crisis: any[] = [];
    const es95: any[] = [];
    const activeAgentKeys: string[] = [];

    /* Historical data — trim right of selectedDate when overlay active */
    if (timeseries) {
      const totalDates = timeseries.dates.length;
      const start = Math.max(0, totalDates - historyMonths);

      for (let i = start; i < totalDates; i++) {
        const date = timeseries.dates[i];
        // Trim history right of selectedDate when overlay is active
        if (hasOverlay && selectedDate && date > selectedDate) continue;

        const s = timeseries.latent_factors.stress[i] ?? null;
        const g = timeseries.latent_factors.growth?.[i] ?? null;
        const cp = timeseries.crisis_probability[i] ?? null;

        stress.push({ date, hist: s });
        growth.push({ date, hist: g });
        crisis.push({ date, hist: cp !== null ? cp * 100 : null });
        es95.push({ date });
      }
    }

    /* MC Simulation overlay (WebSocket live sim) */
    if (simActive && selectedDate) {
      const s0 = initialMu ? initialMu[0] : 0;
      const g0 = initialMu ? (initialMu[2] ?? 0) : 0;

      for (const step of simulationData) {
        const date = addMonthsEnd(selectedDate, step.step);
        const dev = deviationMode;

        {
          const sp5  = step.stress_fan.p5  - (dev ? s0 : 0);
          const sp25 = step.stress_fan.p25 - (dev ? s0 : 0);
          const sp50 = step.stress_fan.p50 - (dev ? s0 : 0);
          const sp75 = step.stress_fan.p75 - (dev ? s0 : 0);
          const sp95 = step.stress_fan.p95 - (dev ? s0 : 0);
          stress.push({
            date,
            sim_p50: sp50,
            sim_base: sp5,
            sim_outer_lo: sp25 - sp5,
            sim_iqr: sp75 - sp25,
            sim_outer_hi: sp95 - sp75,
            isSim: true,
          });
        }

        {
          const gp5  = step.growth_fan.p5  - (dev ? g0 : 0);
          const gp25 = step.growth_fan.p25 - (dev ? g0 : 0);
          const gp50 = step.growth_fan.p50 - (dev ? g0 : 0);
          const gp75 = step.growth_fan.p75 - (dev ? g0 : 0);
          const gp95 = step.growth_fan.p95 - (dev ? g0 : 0);
          growth.push({
            date,
            sim_p50: gp50,
            sim_base: gp5,
            sim_outer_lo: gp25 - gp5,
            sim_iqr: gp75 - gp25,
            sim_outer_hi: gp95 - gp75,
            isSim: true,
          });
        }

        crisis.push({ date, sim: step.crisis_prob * 100, isSim: true });
        es95.push({ date, sim: step.es95_stress, isSim: true });
      }
    }

    /* Agent comparison overlay */
    if (agentsActive && selectedDate && agentResults) {
      const agents = Object.values(agentResults);

      for (const agent of agents) {
        if (!agent.stress_path || agent.stress_path.length === 0) continue;
        activeAgentKeys.push(agent.agent);
        const H = agent.stress_path.length;

        for (let step = 0; step < H; step++) {
          const date = addMonthsEnd(selectedDate, step + 1);
          const key = `agent_${agent.agent}`;

          // Merge into existing data point at this date, or create new one
          const mergeInto = (arr: any[], field: string, val: number | null) => {
            let pt = arr.find((d: any) => d.date === date);
            if (!pt) {
              pt = { date, isSim: true };
              arr.push(pt);
            }
            pt[field] = val;
          };

          mergeInto(stress, key, agent.stress_path[step] ?? null);
          mergeInto(growth, key, agent.growth_path[step] ?? null);
          mergeInto(
            crisis,
            key,
            agent.crisis_prob_path[step] !== undefined
              ? agent.crisis_prob_path[step] * 100
              : null,
          );
          if (agent.stress_fan && agent.stress_fan[step]) {
            mergeInto(es95, key, agent.stress_fan[step].p5 ?? null);
          }
        }
      }
    }

    // Sort by date for proper x-axis ordering
    const cmp = (a: any, b: any) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    stress.sort(cmp);
    growth.sort(cmp);
    crisis.sort(cmp);
    es95.sort(cmp);

    return {
      stressData: stress,
      growthData: growth,
      crisisData: crisis,
      es95Data: es95,
      agentKeys: activeAgentKeys,
    };
  }, [timeseries, simulationData, selectedDate, deviationMode, initialMu, historyMonths, agentResults, hasOverlay, simActive, agentsActive]);

  /* ── Sim progress ─────────────────────────────────────── */
  const lastStep = simulationData.length > 0 ? simulationData[simulationData.length - 1] : null;
  const simH = lastStep?.H ?? 24;

  const dateTick = (value: string) => fmtDate(value);
  const stressTicks = useMemo(() => computeTimeTicks(stressData), [stressData]);
  const growthTicks = useMemo(() => computeTimeTicks(growthData), [growthData]);
  const crisisTicks = useMemo(() => computeTimeTicks(crisisData), [crisisData]);
  const es95Ticks = useMemo(() => computeTimeTicks(es95Data), [es95Data]);
  const showLegend = agentKeys.length > 0 || simActive;

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

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {hasOverlay && selectedDate && (
            <span className="text-[10px] bg-slate-800/80 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/30">
              From {fmtDate(selectedDate)}
            </span>
          )}
          {isRunning && (
            <span className="text-[10px] bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded animate-pulse">
              SIMULATING
            </span>
          )}
          {simulationData.length > 0 && !isRunning && (
            <span className="text-[10px] text-slate-500">
              Step {lastStep?.step ?? 0}/{simH}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {simActive && (
            <button
              onClick={() => setDeviationMode(!deviationMode)}
              className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all ${
                deviationMode
                  ? "bg-indigo-900/40 text-indigo-300 border-indigo-600/40"
                  : "bg-slate-800/40 text-slate-500 border-slate-700/30 hover:text-slate-300"
              }`}
            >
              {deviationMode ? "Deviation" : "Absolute"}
            </button>
          )}
        </div>
      </div>

      {/* Overlay legend */}
      {showLegend && (
        <div className="flex items-center gap-3 flex-wrap text-[10px]">
          <span className="text-slate-600 uppercase font-bold tracking-wider">Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-[2px] bg-red-500 inline-block rounded" />
            <span className="text-slate-400">Historical</span>
          </span>
          {simActive && (
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-[2px] inline-block border-t-2 border-dashed border-orange-400 rounded" />
              <span className="text-slate-400">MC Simulation</span>
            </span>
          )}
          {agentKeys.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="w-5 h-[2px] inline-block rounded" style={{ backgroundColor: AGENT_COLORS[k] || "#888" }} />
              <span className="text-slate-400">{AGENT_LABELS[k] || k}</span>
            </span>
          ))}
        </div>
      )}

      {/* 2x2 chart grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* STRESS FACTOR */}
        <ChartCard title="Stress Factor" titleColor="text-red-400" subtitle={deviationMode ? "(from start)" : ""}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={stressData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} ticks={stressTicks} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={ttStyle} labelFormatter={fmtDate} />
              {selectedDate && hasOverlay && (
                <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />
              )}
              {deviationMode && <ReferenceLine y={0} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />}
              <Line type="monotone" dataKey="hist" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Historical" connectNulls isAnimationActive={false} />
              <Area stackId="sFan" type="monotone" dataKey="sim_base" fill="transparent" stroke="none" isAnimationActive={false} connectNulls />
              <Area stackId="sFan" type="monotone" dataKey="sim_outer_lo" fill="#ef4444" fillOpacity={0.15} stroke="none" isAnimationActive={false} connectNulls />
              <Area stackId="sFan" type="monotone" dataKey="sim_iqr" fill="#f97316" fillOpacity={0.3} stroke="none" isAnimationActive={false} connectNulls />
              <Area stackId="sFan" type="monotone" dataKey="sim_outer_hi" fill="#ef4444" fillOpacity={0.15} stroke="none" isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="sim_p50" stroke="#f97316" strokeWidth={2} strokeDasharray="4 2" dot={false} name="MC Median" isAnimationActive={false} connectNulls />
              {agentKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={`agent_${k}`} stroke={AGENT_COLORS[k] || "#888"} strokeWidth={2} dot={false} name={AGENT_LABELS[k] || k} isAnimationActive={false} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* GROWTH FACTOR */}
        <ChartCard title="Growth Factor" titleColor="text-emerald-400" subtitle={deviationMode ? "(from start)" : ""}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={growthData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} ticks={growthTicks} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={ttStyle} labelFormatter={fmtDate} />
              {selectedDate && hasOverlay && (
                <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />
              )}
              {deviationMode && <ReferenceLine y={0} stroke="#475569" strokeWidth={1} strokeDasharray="2 2" />}
              <Line type="monotone" dataKey="hist" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Historical" connectNulls isAnimationActive={false} />
              <Area stackId="gFan" type="monotone" dataKey="sim_base" fill="transparent" stroke="none" isAnimationActive={false} connectNulls />
              <Area stackId="gFan" type="monotone" dataKey="sim_outer_lo" fill="#22c55e" fillOpacity={0.15} stroke="none" isAnimationActive={false} connectNulls />
              <Area stackId="gFan" type="monotone" dataKey="sim_iqr" fill="#4ade80" fillOpacity={0.3} stroke="none" isAnimationActive={false} connectNulls />
              <Area stackId="gFan" type="monotone" dataKey="sim_outer_hi" fill="#22c55e" fillOpacity={0.15} stroke="none" isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="sim_p50" stroke="#4ade80" strokeWidth={2} strokeDasharray="4 2" dot={false} name="MC Median" isAnimationActive={false} connectNulls />
              {agentKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={`agent_${k}`} stroke={AGENT_COLORS[k] || "#888"} strokeWidth={2} dot={false} name={AGENT_LABELS[k] || k} isAnimationActive={false} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* CRISIS PROBABILITY */}
        <ChartCard title="Crisis Probability (%)" titleColor="text-amber-400">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={crisisData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} ticks={crisisTicks} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} domain={[0, 100]} />
              <Tooltip contentStyle={ttStyle} labelFormatter={fmtDate} formatter={(v: number) => [`${v?.toFixed(1)}%`]} />
              {selectedDate && hasOverlay && (
                <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />
              )}
              <Line type="monotone" dataKey="hist" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Historical" connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="sim" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" dot={false} name="MC Sim" isAnimationActive={false} connectNulls />
              {agentKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={`agent_${k}`} stroke={AGENT_COLORS[k] || "#888"} strokeWidth={2} dot={false} name={AGENT_LABELS[k] || k} isAnimationActive={false} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* EXPECTED SHORTFALL */}
        <ChartCard title="Expected Shortfall (ES95)" titleColor="text-purple-400">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={es95Data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" tick={{ fontSize: 9 }} tickFormatter={dateTick} ticks={es95Ticks} />
              <YAxis stroke="#475569" tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={ttStyle} labelFormatter={fmtDate} />
              {selectedDate && hasOverlay && (
                <ReferenceLine x={selectedDate} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" />
              )}
              <Line type="monotone" dataKey="sim" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 2" dot={false} name="MC ES95" isAnimationActive={false} connectNulls />
              {agentKeys.map((k) => (
                <Line key={k} type="monotone" dataKey={`agent_${k}`} stroke={AGENT_COLORS[k] || "#888"} strokeWidth={2} dot={false} name={AGENT_LABELS[k] || k} isAnimationActive={false} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Summary stats + agent ranking */}
      {(lastStep || agentsActive) && (
        <div className="space-y-2">
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
          {agentsActive && agentResults && (
            <AgentRankingTable agents={Object.values(agentResults)} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function ChartCard({
  title,
  titleColor,
  subtitle,
  children,
}: {
  title: string;
  titleColor: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/80 rounded-xl border border-slate-700/30 p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider mb-1">
        <span className={titleColor}>{title}</span>
        {subtitle && <span className="text-slate-500 ml-1">{subtitle}</span>}
      </h3>
      {children}
    </div>
  );
}

function AgentRankingTable({ agents }: { agents: AgentResult[] }) {
  const bestLoss = Math.min(...agents.map((a) => a.metrics.total_loss));

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3 overflow-x-auto">
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        Agent Performance Ranking
      </h3>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-slate-500 border-b border-slate-700/50">
            <th className="text-left py-1.5 px-2">Agent</th>
            <th className="text-right py-1.5 px-2">Action</th>
            <th className="text-right py-1.5 px-2">Avg Stress</th>
            <th className="text-right py-1.5 px-2">Growth Pen.</th>
            <th className="text-right py-1.5 px-2">ES95</th>
            <th className="text-right py-1.5 px-2">Crisis End</th>
            <th className="text-right py-1.5 px-2 font-bold">Total Loss</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const isBest = a.metrics.total_loss === bestLoss;
            return (
              <tr key={a.agent} className={`border-b border-slate-800/50 ${isBest ? "bg-green-900/10" : ""}`}>
                <td className="py-1.5 px-2 flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: AGENT_COLORS[a.agent] || "#888" }}
                  />
                  <span className="truncate">{a.label}</span>
                  {isBest && (
                    <span className="text-[8px] bg-green-800/40 text-green-300 px-1 py-0.5 rounded-full">BEST</span>
                  )}
                </td>
                <td className="text-right py-1.5 px-2 font-mono">
                  {a.delta_bps > 0 ? "+" : ""}{a.delta_bps}
                </td>
                <td className="text-right py-1.5 px-2">{a.metrics.mean_stress.toFixed(4)}</td>
                <td className="text-right py-1.5 px-2">{a.metrics.mean_growth_penalty.toFixed(4)}</td>
                <td className="text-right py-1.5 px-2">{a.metrics.mean_es95.toFixed(4)}</td>
                <td className="text-right py-1.5 px-2">{(a.metrics.crisis_end * 100).toFixed(1)}%</td>
                <td className="text-right py-1.5 px-2 font-bold font-mono">{a.metrics.total_loss.toFixed(4)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
