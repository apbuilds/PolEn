import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area,
} from "recharts";
import InfoTooltip from "./InfoTooltip";

interface FedPolicyDashboardProps {
  inflationGap: number;
  fedRate: number;
  stressScore: number;
  regimeLabel: string;
  crisisThreshold: number;
  mu_T: number[];
}

export default function FedPolicyDashboard({
  inflationGap,
  fedRate,
  stressScore,
  regimeLabel,
  crisisThreshold,
  mu_T,
}: FedPolicyDashboardProps) {
  // Taylor Rule calculation
  const inflationTarget = 0.02;
  const rNeutral = 0.02;
  const taylorRate = rNeutral + 0.5 * inflationGap + 0.5 * (mu_T[2] || 0);
  const taylorDeviation = fedRate - taylorRate;

  // Dual mandate gauge data
  const mandateData = [
    {
      label: "Price Stability",
      value: Math.abs(inflationGap) * 100,
      target: 0,
      unit: "%",
      color: Math.abs(inflationGap) < 0.01 ? "#22c55e" : Math.abs(inflationGap) < 0.02 ? "#f59e0b" : "#ef4444",
      description: "Deviation of inflation from 2% target",
    },
    {
      label: "Financial Stability",
      value: stressScore,
      target: 0,
      unit: "σ",
      color: stressScore < 0.5 ? "#22c55e" : stressScore < 1.5 ? "#f59e0b" : "#ef4444",
      description: "Systemic stress in standard deviations",
    },
  ];

  // Policy stance assessment
  const getStance = () => {
    if (fedRate > taylorRate + 0.005) return { label: "Restrictive", color: "text-red-400", icon: "🔺" };
    if (fedRate < taylorRate - 0.005) return { label: "Accommodative", color: "text-green-400", icon: "🔻" };
    return { label: "Neutral", color: "text-slate-300", icon: "⏸" };
  };
  const stance = getStance();

  // Regime risk gauge
  const regimeConfig = {
    Normal: { color: "from-emerald-500 to-green-600", fill: 33, icon: "🟢" },
    Fragile: { color: "from-amber-500 to-yellow-600", fill: 66, icon: "🟡" },
    Crisis: { color: "from-red-500 to-rose-600", fill: 100, icon: "🔴" },
  }[regimeLabel] || { color: "from-slate-500 to-slate-600", fill: 0, icon: "⚪" };

  return (
    <div className="space-y-4">
      {/* Fed Policy Stance Header */}
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🏛</span>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Federal Reserve Policy Monitor</h3>
          <InfoTooltip text="Real-time Federal Reserve monetary policy analysis. Shows the current fed funds rate, Taylor Rule implied rate, policy stance, and dual mandate metrics (price stability + maximum employment)." />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Fed Rate */}
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/30">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-slate-400">Fed Funds Rate</span>
              <InfoTooltip text="Current effective federal funds rate — the interest rate at which banks lend to each other overnight. Set by the Federal Open Market Committee (FOMC)." position="right" />
            </div>
            <div className="text-xl font-mono font-bold text-blue-400">
              {(fedRate * 100).toFixed(2)}%
            </div>
          </div>

          {/* Taylor Rule Rate */}
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/30">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-slate-400">Taylor Rule Rate</span>
              <InfoTooltip text="The interest rate implied by the Taylor Rule: r* = r_neutral + 0.5×(inflation − target) + 0.5×output_gap. A benchmark for whether current policy is too tight or too loose." position="right" />
            </div>
            <div className="text-xl font-mono font-bold text-purple-400">
              {(taylorRate * 100).toFixed(2)}%
            </div>
          </div>

          {/* Policy Stance */}
          <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/30">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-slate-400">Policy Stance</span>
              <InfoTooltip text="Whether current monetary policy is tighter (restrictive) or looser (accommodative) than the Taylor Rule suggests." position="left" />
            </div>
            <div className={`text-xl font-bold ${stance.color} flex items-center gap-2`}>
              <span>{stance.icon}</span>
              <span>{stance.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dual Mandate Gauges */}
      <div className="grid grid-cols-2 gap-3">
        {mandateData.map((d) => (
          <div key={d.label} className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] text-slate-400">{d.label}</span>
              <InfoTooltip text={d.description} />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-mono font-bold" style={{ color: d.color }}>
                {d.value.toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 pb-0.5">{d.unit}</span>
            </div>
            {/* Mini gauge bar */}
            <div className="mt-2 w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(Math.abs(d.value) / (d.label === "Price Stability" ? 5 : 3) * 100, 100)}%`,
                  backgroundColor: d.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Regime Risk Gauge */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Regime Risk Level</span>
          <InfoTooltip text="Current macro regime detected by the Kalman filter + Markov switching model. Normal = low systemic risk, Fragile = elevated risk with regime instability, Crisis = acute systemic stress." />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xl">{regimeConfig.icon}</span>
          <div className="flex-1">
            <div className="text-sm font-bold text-slate-200">{regimeLabel}</div>
            <div className="mt-1 w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${regimeConfig.color} transition-all duration-700`}
                style={{ width: `${regimeConfig.fill}%` }}
              />
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Stress</div>
            <div className="text-sm font-mono font-bold text-slate-200">{stressScore.toFixed(3)}σ</div>
          </div>
        </div>
      </div>

      {/* Taylor Deviation Visual */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Taylor Rule Deviation</span>
          <InfoTooltip text="Gap between actual fed funds rate and Taylor Rule implied rate. Positive = policy is tighter than suggested. Negative = policy is looser than suggested." />
        </div>
        <div className="relative h-8">
          {/* Center line */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-600" />
          {/* Zero marker */}
          <div className="absolute top-0 left-1/2 bottom-0 w-px bg-slate-500" />
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] text-slate-500">0</div>
          {/* Deviation indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 h-5 rounded-full transition-all duration-500"
            style={{
              left: taylorDeviation >= 0 ? "50%" : `${50 + taylorDeviation * 100 * 10}%`,
              width: `${Math.min(Math.abs(taylorDeviation) * 100 * 10, 45)}%`,
              backgroundColor: taylorDeviation > 0 ? "#ef4444" : "#22c55e",
              opacity: 0.6,
            }}
          />
          {/* Value label */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${taylorDeviation > 0 ? "text-red-300 bg-red-900/50" : taylorDeviation < 0 ? "text-green-300 bg-green-900/50" : "text-slate-300 bg-slate-800"}`}>
              {taylorDeviation > 0 ? "+" : ""}{(taylorDeviation * 100).toFixed(0)} bps
            </span>
          </div>
        </div>
        <div className="flex justify-between text-[8px] text-slate-500 mt-4">
          <span>← Accommodative</span>
          <span>Restrictive →</span>
        </div>
      </div>

      {/* Latent State Decomposition */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-slate-400 uppercase font-bold">Latent State Vector μ_T</span>
          <InfoTooltip text="The 4-dimensional latent state estimated by the Kalman filter + EM algorithm. Stress = systemic risk, Liquidity = market liquidity conditions, Growth = economic activity, Inflation Gap = deviation from 2% target." />
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Stress", value: mu_T[0], color: "#ef4444", icon: "📉" },
            { label: "Liquidity", value: mu_T[1], color: "#3b82f6", icon: "💧" },
            { label: "Growth", value: mu_T[2], color: "#22c55e", icon: "📈" },
            { label: "Infl Gap", value: inflationGap, color: "#f59e0b", icon: "🔥" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-base mb-0.5">{s.icon}</div>
              <div className="text-[9px] text-slate-400">{s.label}</div>
              <div className="text-sm font-mono font-bold" style={{ color: s.color }}>
                {(s.value ?? 0).toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
