import React from "react";
import { SimParams } from "../pages/index";

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
}: PolicyControlsProps) {
  const policyButtons = [
    { label: "Ease (-50)", bps: -50, color: "bg-green-700 hover:bg-green-600" },
    { label: "Hold (0)", bps: 0, color: "bg-slate-600 hover:bg-slate-500" },
    { label: "Tighten (+50)", bps: 50, color: "bg-red-700 hover:bg-red-600" },
  ];

  const shockButtons = [
    { label: "Credit", key: "credit" as const },
    { label: "Vol", key: "vol" as const },
    { label: "Rate", key: "rate" as const },
  ];

  return (
    <div className="space-y-4">
      {/* POLICY ACTION */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Policy Action</h3>
        <div className="grid grid-cols-3 gap-1">
          {policyButtons.map((btn) => (
            <button
              key={btn.bps}
              onClick={() => setParams((p) => ({ ...p, delta_bps: btn.bps }))}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                params.delta_bps === btn.bps
                  ? btn.color + " ring-2 ring-indigo-400"
                  : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <label className="text-xs text-slate-400 flex justify-between">
            <span>Custom Δbps</span>
            <span className="font-mono">{params.delta_bps > 0 ? "+" : ""}{params.delta_bps}</span>
          </label>
          <input
            type="range"
            min={-200}
            max={200}
            step={5}
            value={params.delta_bps}
            onChange={(e) => setParams((p) => ({ ...p, delta_bps: Number(e.target.value) }))}
            className="w-full mt-1"
          />
        </div>
      </section>

      {/* OBJECTIVE WEIGHTS */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Objective Weights</h3>
        {[
          { key: "alpha" as const, label: "α Stability", color: "text-blue-400" },
          { key: "beta" as const, label: "β Growth", color: "text-green-400" },
          { key: "gamma" as const, label: "γ Tail Risk", color: "text-orange-400" },
          { key: "lambda" as const, label: "λ Crisis End", color: "text-red-400" },
        ].map(({ key, label, color }) => (
          <div key={key} className="mb-1">
            <label className="text-xs flex justify-between">
              <span className={color}>{label}</span>
              <span className="font-mono text-slate-400">{params[key].toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={params[key]}
              onChange={(e) => setParams((p) => ({ ...p, [key]: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
        ))}
      </section>

      {/* SHOCK INJECTION */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Shock Injection</h3>
        {shockButtons.map(({ label, key }) => (
          <div key={key} className="mb-1">
            <label className="text-xs flex justify-between">
              <span className="text-amber-400">{label} Shock</span>
              <span className="font-mono text-slate-400">{params.shocks[key].toFixed(1)}σ</span>
            </label>
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={params.shocks[key]}
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  shocks: { ...p.shocks, [key]: Number(e.target.value) },
                }))
              }
              className="w-full"
            />
          </div>
        ))}
      </section>

      {/* SIMULATION SETTINGS */}
      <section>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Simulation</h3>
        <div className="space-y-1">
          <div>
            <label className="text-xs flex justify-between">
              <span>Paths (N)</span>
              <span className="font-mono text-slate-400">{params.N.toLocaleString()}</span>
            </label>
            <input
              type="range"
              min={1000}
              max={10000}
              step={500}
              value={params.N}
              onChange={(e) => setParams((p) => ({ ...p, N: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs flex justify-between">
              <span>Horizon (months)</span>
              <span className="font-mono text-slate-400">{params.H}</span>
            </label>
            <input
              type="range"
              min={6}
              max={36}
              step={1}
              value={params.H}
              onChange={(e) => setParams((p) => ({ ...p, H: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
          <div>
            <label className="text-xs flex justify-between">
              <span>Speed</span>
              <span className="font-mono text-slate-400">{params.speed_ms}ms</span>
            </label>
            <input
              type="range"
              min={20}
              max={500}
              step={10}
              value={params.speed_ms}
              onChange={(e) => setParams((p) => ({ ...p, speed_ms: Number(e.target.value) }))}
              className="w-full"
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <label className="text-xs text-slate-400">Regime Switching</label>
            <button
              onClick={() => setParams((p) => ({ ...p, regime_switching: !p.regime_switching }))}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                params.regime_switching ? "bg-indigo-600" : "bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  params.regime_switching ? "left-5" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* ACTION BUTTONS */}
      <section className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {!isRunning ? (
            <button
              onClick={onRun}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded font-medium text-sm transition-colors flex items-center justify-center gap-1"
            >
              ▶ Run
            </button>
          ) : (
            <button
              onClick={onPause}
              className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-2 rounded font-medium text-sm transition-colors flex items-center justify-center gap-1"
            >
              ⏸ Pause
            </button>
          )}
          <button
            onClick={onReset}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded font-medium text-sm transition-colors"
          >
            ↺ Reset
          </button>
        </div>
        <button
          onClick={onRecommend}
          disabled={recommendLoading}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-2 rounded font-medium text-sm transition-colors flex items-center justify-center gap-1"
        >
          {recommendLoading ? (
            <>
              <span className="animate-spin">⚙</span> Computing...
            </>
          ) : (
            "🎯 Recommend Policy"
          )}
        </button>
        <button
          onClick={onCompareToggle}
          className={`w-full px-3 py-2 rounded font-medium text-sm transition-colors ${
            compareMode
              ? "bg-purple-700 hover:bg-purple-600 text-white ring-2 ring-purple-400"
              : "bg-slate-700 hover:bg-slate-600 text-slate-200"
          }`}
        >
          {compareMode ? "📊 Compare Mode ON" : "📊 Compare Mode"}
        </button>
      </section>

      {/* RUNNING INDICATOR */}
      {isRunning && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-indigo-400 text-sm animate-pulse-ring">
            <span className="w-2 h-2 bg-indigo-400 rounded-full" />
            Simulating...
          </div>
        </div>
      )}
    </div>
  );
}
