/**
 * SimulationSidebar — Right-side panel for simulation controls.
 *
 * Consolidates: date selection, policy action, shock injection,
 * agent selection, objective weights, sim params, and run buttons.
 */

import React from "react";
import InfoTooltip from "./InfoTooltip";

/* ── Types ──────────────────────────────────────────────────── */

export interface SimParams {
  delta_bps: number;
  alpha: number;
  beta: number;
  gamma: number;
  lambda: number;
  N: number;
  H: number;
  speed_ms: number;
  shocks: { credit: number; vol: number; rate: number };
  regime_switching: boolean;
}

export interface AgentDef {
  id: string;
  label: string;
  icon: string;
}

interface SimulationSidebarProps {
  /* Date / starting point */
  availableDates: string[];
  selectedDate: string | null;
  onDateChange: (date: string) => void;

  /* Params */
  params: SimParams;
  setParams: React.Dispatch<React.SetStateAction<SimParams>>;

  /* Agents */
  agents: AgentDef[];
  selectedAgents: string[];
  onToggleAgent: (id: string) => void;

  /* Policy mode */
  policyMode: "heuristic" | "rl";
  onPolicyModeChange: (m: "heuristic" | "rl") => void;

  /* Actions */
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onAgentRun: () => void;
  onRecommend: () => void;

  /* Status */
  isRunning: boolean;
  agentRunning: boolean;
  recommendLoading: boolean;

  /* Snapshot info */
  snapshotRegime?: string;
  snapshotStress?: number;
}

/* ── Component ──────────────────────────────────────────────── */

export default function SimulationSidebar({
  availableDates,
  selectedDate,
  onDateChange,
  params,
  setParams,
  agents,
  selectedAgents,
  onToggleAgent,
  policyMode,
  onPolicyModeChange,
  onRun,
  onPause,
  onReset,
  onAgentRun,
  onRecommend,
  isRunning,
  agentRunning,
  recommendLoading,
  snapshotRegime,
  snapshotStress,
}: SimulationSidebarProps) {
  const policyBtns = [
    { label: "Ease",    bps: -50,  color: "from-green-700 to-emerald-700", ring: "ring-green-400" },
    { label: "Hold",    bps: 0,    color: "from-slate-600 to-slate-700",   ring: "ring-slate-400" },
    { label: "Tighten", bps: 50,   color: "from-red-700 to-rose-700",     ring: "ring-red-400"   },
  ];

  return (
    <div className="space-y-3">
      {/* ── HEADER ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-base">🔬</span>
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Simulation</h2>
      </div>

      {/* ── STARTING POINT ────────────────────────────────── */}
      <Section title="Starting Point" icon="📍">
        <select
          value={selectedDate || ""}
          onChange={(e) => onDateChange(e.target.value)}
          className="w-full bg-slate-900/60 border border-slate-700/30 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50"
        >
          <option value="">Latest</option>
          {availableDates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {snapshotRegime && (
          <div className="flex items-center gap-2 mt-1.5 text-[10px]">
            <span className={`px-1.5 py-0.5 rounded font-bold ${
              snapshotRegime === "Normal" ? "bg-green-900/40 text-green-300" :
              snapshotRegime === "Fragile" ? "bg-amber-900/40 text-amber-300" :
              "bg-red-900/40 text-red-300"
            }`}>{snapshotRegime}</span>
            {snapshotStress !== undefined && (
              <span className="text-slate-500">stress {snapshotStress.toFixed(3)}</span>
            )}
          </div>
        )}
      </Section>

      {/* ── POLICY ACTION ─────────────────────────────────── */}
      <Section title="Policy Action" icon="⚡">
        <div className="grid grid-cols-3 gap-1">
          {policyBtns.map((b) => (
            <button
              key={b.bps}
              onClick={() => setParams((p) => ({ ...p, delta_bps: b.bps }))}
              className={`px-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                params.delta_bps === b.bps
                  ? `bg-gradient-to-br ${b.color} ring-1 ${b.ring} text-white`
                  : "bg-slate-800/60 text-slate-400 hover:bg-slate-700/60"
              }`}
            >
              {b.label}
              <div className="text-[8px] opacity-70 mt-0.5">{b.bps > 0 ? "+" : ""}{b.bps}</div>
            </button>
          ))}
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
            <span>Custom</span>
            <span className={`font-mono font-bold ${params.delta_bps > 0 ? "text-red-400" : params.delta_bps < 0 ? "text-green-400" : "text-slate-300"}`}>
              {params.delta_bps > 0 ? "+" : ""}{params.delta_bps} bps
            </span>
          </div>
          <input type="range" min={-200} max={200} step={5} value={params.delta_bps}
            onChange={(e) => setParams((p) => ({ ...p, delta_bps: Number(e.target.value) }))}
            className="w-full h-1 accent-indigo-500" />
        </div>
      </Section>

      {/* ── SHOCK INJECTION ───────────────────────────────── */}
      <Section title="Shock Injection" icon="💥">
        {([
          { key: "credit" as const, label: "Credit", desc: "spread widening" },
          { key: "vol" as const,    label: "Volatility", desc: "VIX spike" },
          { key: "rate" as const,   label: "Rate", desc: "yield shift" },
        ]).map(({ key, label, desc }) => (
          <div key={key} className="mb-1.5">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-amber-400/80">{label} <span className="text-slate-600 text-[8px]">{desc}</span></span>
              <span className="font-mono text-slate-400">{params.shocks[key].toFixed(1)}σ</span>
            </div>
            <input type="range" min={0} max={3} step={0.1} value={params.shocks[key]}
              onChange={(e) => setParams((p) => ({ ...p, shocks: { ...p.shocks, [key]: Number(e.target.value) } }))}
              className="w-full h-1 accent-amber-500" />
          </div>
        ))}
      </Section>

      {/* ── AGENTS ────────────────────────────────────────── */}
      <Section title="Policy Agents" icon="🤖">
        <div className="space-y-1">
          {agents.map((a) => (
            <label
              key={a.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-[11px] ${
                selectedAgents.includes(a.id) ? "bg-slate-700/40 text-slate-100" : "text-slate-500 hover:bg-slate-800/40"
              }`}
            >
              <input type="checkbox" checked={selectedAgents.includes(a.id)}
                onChange={() => onToggleAgent(a.id)} className="accent-indigo-500 w-3 h-3" />
              <span>{a.icon} {a.label}</span>
              {a.id === "historical" && !selectedDate && (
                <span className="text-[8px] text-slate-600 ml-auto">needs date</span>
              )}
            </label>
          ))}
        </div>
        <button onClick={onAgentRun} disabled={agentRunning || selectedAgents.length === 0}
          className="w-full mt-2 bg-gradient-to-r from-indigo-600/80 to-purple-600/80 hover:from-indigo-500 hover:to-purple-500
            disabled:opacity-30 text-white text-[10px] font-semibold py-2 rounded-lg transition-all">
          {agentRunning ? "⏳ Running..." : "▶ Compare Agents"}
        </button>
      </Section>

      {/* ── POLICY ENGINE ─────────────────────────────────── */}
      <Section title="Policy Engine" icon="⚙">
        <div className="grid grid-cols-2 gap-1.5">
          {([
            { m: "heuristic" as const, label: "Heuristic", sub: "MC Optimizer" },
            { m: "rl" as const, label: "RL Agent", sub: "PPO Neural" },
          ]).map(({ m, label, sub }) => (
            <button key={m} onClick={() => onPolicyModeChange(m)}
              className={`px-2 py-1.5 rounded-lg text-[10px] transition-all text-center ${
                policyMode === m
                  ? "bg-indigo-700/60 ring-1 ring-indigo-400/40 text-white"
                  : "bg-slate-800/60 text-slate-400 hover:bg-slate-700/60"
              }`}
            >
              <div className="font-medium">{label}</div>
              <div className="text-[8px] opacity-60">{sub}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* ── OBJECTIVE WEIGHTS ─────────────────────────────── */}
      <Section title="Objective Weights" icon="⚖">
        {([
          { key: "alpha" as const, label: "Stability", color: "text-blue-400" },
          { key: "beta" as const,  label: "Growth",    color: "text-green-400" },
          { key: "gamma" as const, label: "Tail Risk", color: "text-orange-400" },
          { key: "lambda" as const, label: "Crisis Exit", color: "text-red-400" },
        ]).map(({ key, label, color }) => (
          <div key={key} className="mb-1">
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className={color}>{label}</span>
              <span className="font-mono text-slate-400">{params[key].toFixed(1)}</span>
            </div>
            <input type="range" min={0} max={5} step={0.1} value={params[key]}
              onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
              className="w-full h-1 accent-indigo-500" />
          </div>
        ))}
      </Section>

      {/* ── SIM SETTINGS ──────────────────────────────────── */}
      <Section title="Simulation Settings" icon="🎲">
        <Slider label="Paths (N)" value={params.N} min={500} max={10000} step={500}
          onChange={(v) => setParams((p) => ({ ...p, N: v }))} fmt={(v) => v.toLocaleString()} />
        <Slider label="Horizon (months)" value={params.H} min={6} max={36} step={1}
          onChange={(v) => setParams((p) => ({ ...p, H: v }))} />
        <Slider label="Speed (ms)" value={params.speed_ms} min={20} max={500} step={10}
          onChange={(v) => setParams((p) => ({ ...p, speed_ms: v }))} />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400">Regime Switching</span>
          <button onClick={() => setParams((p) => ({ ...p, regime_switching: !p.regime_switching }))}
            className={`w-9 h-5 rounded-full transition-all relative ${
              params.regime_switching ? "bg-indigo-600" : "bg-slate-700"
            }`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              params.regime_switching ? "left-[18px]" : "left-0.5"
            }`} />
          </button>
        </div>
      </Section>

      {/* ── RUN BUTTONS ───────────────────────────────────── */}
      <div className="space-y-1.5 pt-1">
        <div className="grid grid-cols-2 gap-1.5">
          {!isRunning ? (
            <button onClick={onRun}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-2 py-2 rounded-lg text-[11px] font-semibold transition-all shadow-md shadow-indigo-900/20">
              ▶ Run Sim
            </button>
          ) : (
            <button onClick={onPause}
              className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-2 py-2 rounded-lg text-[11px] font-semibold transition-all">
              ⏸ Pause
            </button>
          )}
          <button onClick={onReset}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-2 rounded-lg text-[11px] font-medium border border-slate-700/50 transition-all">
            ↺ Reset
          </button>
        </div>
        <button onClick={onRecommend} disabled={recommendLoading}
          className="w-full bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500 hover:to-teal-500
            disabled:opacity-30 text-white px-2 py-2 rounded-lg text-[10px] font-semibold transition-all">
          {recommendLoading ? "Computing..." : "🎯 Recommend Optimal Policy"}
        </button>
      </div>
    </div>
  );
}

/* ── Shared sub-components ──────────────────────────────────── */

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{icon}</span>
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-400">{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-indigo-500" />
    </div>
  );
}
