import React from "react";
import { SimParams } from "../pages/index";
import InfoTooltip from "./InfoTooltip";

interface PolicyControlsProps {
  params: SimParams;
  setParams: React.Dispatch<React.SetStateAction<SimParams>>;
  onRun: () => void;
  onPause: () => void;
  onReset: () => void;
  onRecommend: () => void;
  onCompareToggle: () => void;
  isRunning: boolean;
  compareMode: boolean;
  recommendLoading: boolean;
  policyMode: "heuristic" | "rl";
  onPolicyModeChange: (mode: "heuristic" | "rl") => void;
}

export default function PolicyControls({
  params,
  setParams,
  onRun,
  onPause,
  onReset,
  onRecommend,
  onCompareToggle,
  isRunning,
  compareMode,
  recommendLoading,
  policyMode,
  onPolicyModeChange,
}: PolicyControlsProps) {
  const policyButtons = [
    { label: "Ease", detail: "-50 bps", bps: -50, color: "from-green-700 to-emerald-700", activeRing: "ring-green-400" },
    { label: "Hold", detail: "0 bps", bps: 0, color: "from-slate-600 to-slate-700", activeRing: "ring-slate-400" },
    { label: "Tighten", detail: "+50 bps", bps: 50, color: "from-red-700 to-rose-700", activeRing: "ring-red-400" },
  ];

  return (
    <div className="space-y-5">
      {/* POLICY ENGINE MODE */}
      <section className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Policy Engine</h3>
          <InfoTooltip text="Choose between the rule-based Monte Carlo heuristic optimizer or the trained PPO reinforcement learning agent." />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {([
            { mode: "heuristic" as const, label: "Heuristic", desc: "Monte Carlo Optimizer", detail: "Grid search + MC sims" },
            { mode: "rl" as const, label: "RL Agent", desc: "PPO Neural Policy", detail: "Trained deep RL" },
          ]).map(({ mode, label, desc, detail }) => (
            <button
              key={mode}
              onClick={() => onPolicyModeChange(mode)}
              className={`relative px-3 py-2.5 rounded-lg text-xs font-medium transition-all text-center overflow-hidden ${
                policyMode === mode
                  ? "bg-gradient-to-br from-indigo-600 to-purple-700 ring-2 ring-indigo-400/60 text-white shadow-lg shadow-indigo-900/30"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50"
              }`}
            >
              <div className="relative">
                <div className="text-sm">{label}</div>
                <div className="text-[10px] opacity-80 mt-0.5">{desc}</div>
                <div className="text-[8px] opacity-50 mt-0.5">{detail}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-center">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] ${
            policyMode === "rl"
              ? "bg-indigo-900/40 text-indigo-300 border border-indigo-700/30"
              : "bg-slate-800 text-slate-400 border border-slate-700/30"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${policyMode === "rl" ? "bg-indigo-400 animate-pulse" : "bg-slate-500"}`} />
            Active: {policyMode === "rl" ? "Reinforcement Learning" : "Heuristic Optimizer"}
          </span>
        </div>
      </section>

      {/* POLICY ACTION */}
      <section className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Policy Action</h3>
          <InfoTooltip text="Select a discrete policy action or use the slider for a custom basis-point change to test in Monte Carlo simulation." />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {policyButtons.map((btn) => (
            <button
              key={btn.bps}
              onClick={() => setParams((p) => ({ ...p, delta_bps: btn.bps }))}
              className={`px-2 py-2 rounded-lg text-xs font-medium transition-all ${
                params.delta_bps === btn.bps
                  ? "bg-gradient-to-br " + btn.color + " ring-2 " + btn.activeRing + " text-white shadow-lg"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50"
              }`}
            >
              <div className="font-semibold">{btn.label}</div>
              <div className="text-[10px] opacity-70">{btn.detail}</div>
            </button>
          ))}
        </div>
        <div className="mt-3">
          <label className="text-[10px] text-slate-400 flex justify-between mb-1">
            <span>Custom Rate</span>
            <span className={"font-mono font-bold " + (params.delta_bps > 0 ? "text-red-400" : params.delta_bps < 0 ? "text-green-400" : "text-slate-300")}>
              {params.delta_bps > 0 ? "+" : ""}{params.delta_bps} bps
            </span>
          </label>
          <input type="range" min={-200} max={200} step={5} value={params.delta_bps}
            onChange={(e) => setParams((p) => ({ ...p, delta_bps: Number(e.target.value) }))} className="w-full" />
        </div>
      </section>

      {/* OBJECTIVE WEIGHTS */}
      <section className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Objective Weights</h3>
          <InfoTooltip text="Control relative importance of each objective in the heuristic loss function." />
        </div>
        {[
          { key: "alpha" as const, label: "Stability", color: "text-blue-400", desc: "Stress min" },
          { key: "beta" as const, label: "Growth", color: "text-green-400", desc: "Output prot" },
          { key: "gamma" as const, label: "Tail Risk", color: "text-orange-400", desc: "ES95 pen" },
          { key: "lambda" as const, label: "Crisis End", color: "text-red-400", desc: "Exit speed" },
        ].map(({ key, label, color, desc }) => (
          <div key={key} className="mb-2">
            <label className="text-[10px] flex items-center justify-between gap-1">
              <span className="flex items-center gap-1.5">
                <span className={color + " font-semibold"}>{label}</span>
                <span className="text-slate-600 text-[8px]">{desc}</span>
              </span>
              <span className="font-mono text-slate-400">{params[key].toFixed(1)}</span>
            </label>
            <input type="range" min={0} max={5} step={0.1} value={params[key]}
              onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))} className="w-full" />
          </div>
        ))}
      </section>

      {/* SHOCK INJECTION */}
      <section className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Shock Injection</h3>
          <InfoTooltip text="Inject exogenous shocks to stress-test policies. Measured in standard deviations." />
        </div>
        {[
          { label: "Credit", key: "credit" as const, desc: "Spread widening" },
          { label: "Volatility", key: "vol" as const, desc: "VIX spike" },
          { label: "Rate", key: "rate" as const, desc: "Yield curve shift" },
        ].map(({ label, key, desc }) => (
          <div key={key} className="mb-2">
            <label className="text-[10px] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="text-amber-400 font-medium">{label}</span>
                <span className="text-slate-600 text-[8px]">{desc}</span>
              </span>
              <span className="font-mono text-slate-400">{params.shocks[key].toFixed(1)}s</span>
            </label>
            <input type="range" min={0} max={3} step={0.1} value={params.shocks[key]}
              onChange={(e) => setParams((p) => ({ ...p, shocks: { ...p.shocks, [key]: Number(e.target.value) } }))}
              className="w-full" />
          </div>
        ))}
      </section>

      {/* SIMULATION SETTINGS */}
      <section className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Simulation</h3>
          <InfoTooltip text="Configure Monte Carlo simulation: paths, horizon, animation speed, and regime switching." />
        </div>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] flex justify-between mb-0.5">
              <span className="text-slate-400">Paths (N)</span>
              <span className="font-mono text-slate-400">{params.N.toLocaleString()}</span>
            </label>
            <input type="range" min={1000} max={10000} step={500} value={params.N}
              onChange={(e) => setParams((p) => ({ ...p, N: Number(e.target.value) }))} className="w-full" />
          </div>
          <div>
            <label className="text-[10px] flex justify-between mb-0.5">
              <span className="text-slate-400">Horizon (months)</span>
              <span className="font-mono text-slate-400">{params.H}</span>
            </label>
            <input type="range" min={6} max={36} step={1} value={params.H}
              onChange={(e) => setParams((p) => ({ ...p, H: Number(e.target.value) }))} className="w-full" />
          </div>
          <div>
            <label className="text-[10px] flex justify-between mb-0.5">
              <span className="text-slate-400">Speed</span>
              <span className="font-mono text-slate-400">{params.speed_ms}ms</span>
            </label>
            <input type="range" min={20} max={500} step={10} value={params.speed_ms}
              onChange={(e) => setParams((p) => ({ ...p, speed_ms: Number(e.target.value) }))} className="w-full" />
          </div>
          <div className="flex items-center justify-between mt-2 py-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-slate-400">Regime Switching</label>
              <InfoTooltip text="Enable Markov regime-switching: simulation transitions between Normal, Fragile, and Crisis regimes." position="right" />
            </div>
            <button
              onClick={() => setParams((p) => ({ ...p, regime_switching: !p.regime_switching }))}
              className={"w-11 h-6 rounded-full transition-all duration-300 relative " + (
                params.regime_switching ? "bg-gradient-to-r from-indigo-500 to-purple-600" : "bg-slate-700"
              )}
            >
              <span className={"absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 " + (
                params.regime_switching ? "left-[22px]" : "left-0.5"
              )} />
            </button>
          </div>
        </div>
      </section>

      {/* ACTION BUTTONS */}
      <section className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {!isRunning ? (
            <button onClick={onRun}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-3 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-1.5">
              Run Sim
            </button>
          ) : (
            <button onClick={onPause}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white px-3 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-amber-900/30 flex items-center justify-center gap-1.5">
              Pause
            </button>
          )}
          <button onClick={onReset}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2.5 rounded-lg font-medium text-sm transition-colors border border-slate-700/50 flex items-center justify-center gap-1.5">
            Reset
          </button>
        </div>
        <button onClick={onRecommend} disabled={recommendLoading}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white px-3 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2">
          {recommendLoading ? "Computing..." : "Recommend Optimal Policy"}
        </button>
        <button onClick={onCompareToggle}
          className={"w-full px-3 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 " + (
            compareMode
              ? "bg-gradient-to-r from-purple-700 to-violet-700 text-white ring-2 ring-purple-400/50"
              : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50"
          )}>
          {compareMode ? "Compare Mode ON" : "Compare Mode"}
        </button>
      </section>

      {isRunning && (
        <div className="text-center py-2">
          <div className="inline-flex items-center gap-2 text-indigo-400 text-sm animate-pulse-ring">
            <span className="w-2 h-2 bg-indigo-400 rounded-full" />
            Simulating...
          </div>
        </div>
      )}
    </div>
  );
}
