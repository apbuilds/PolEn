import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ── Types ────────────────────────────────────────────────────── */

interface AgentResult {
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

interface AgentComparisonProps {
  results: Record<string, AgentResult>;
  horizon: number;
}

/* ── Constants ────────────────────────────────────────────────── */

const AGENT_COLORS: Record<string, string> = {
  custom: "#3b82f6",
  heuristic: "#10b981",
  rl: "#a855f7",
  historical: "#f59e0b",
};

const tooltipStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "8px",
  fontSize: "11px",
};

/* ── Component ────────────────────────────────────────────────── */

/**
 * Displays side-by-side comparison of multiple policy agents:
 *  - Ranking table with loss components and the best agent highlighted
 *  - Median stress, crisis probability, and growth paths over time
 */
export default function AgentComparison({
  results,
  horizon,
}: AgentComparisonProps) {
  const agents = Object.values(results);
  if (agents.length === 0) return null;

  const bestLoss = Math.min(...agents.map((a) => a.metrics.total_loss));

  /* ── Build chart data arrays ─────────────────────────────── */

  const stressData = Array.from({ length: horizon }, (_, i) => {
    const point: Record<string, number> = { step: i + 1 };
    agents.forEach((a) => {
      if (a.stress_path[i] !== undefined) point[a.agent] = a.stress_path[i];
    });
    return point;
  });

  const crisisData = Array.from({ length: horizon }, (_, i) => {
    const point: Record<string, number> = { step: i + 1 };
    agents.forEach((a) => {
      if (a.crisis_prob_path[i] !== undefined)
        point[a.agent] = a.crisis_prob_path[i] * 100;
    });
    return point;
  });

  const growthData = Array.from({ length: horizon }, (_, i) => {
    const point: Record<string, number> = { step: i + 1 };
    agents.forEach((a) => {
      if (a.growth_path[i] !== undefined) point[a.agent] = a.growth_path[i];
    });
    return point;
  });

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* ── Metrics table ─────────────────────────────────── */}
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-4 overflow-x-auto">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
          Agent Performance Comparison
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700/50">
              <th className="text-left py-2 px-2">Agent</th>
              <th className="text-right py-2 px-2">Action</th>
              <th className="text-right py-2 px-2">Avg Stress</th>
              <th className="text-right py-2 px-2">Growth Penalty</th>
              <th className="text-right py-2 px-2">ES95</th>
              <th className="text-right py-2 px-2">Crisis End</th>
              <th className="text-right py-2 px-2 font-bold">Total Loss</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const isBest = a.metrics.total_loss === bestLoss;
              return (
                <tr
                  key={a.agent}
                  className={`border-b border-slate-800/50 ${
                    isBest ? "bg-green-900/10" : ""
                  }`}
                >
                  <td className="py-2 px-2 flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: AGENT_COLORS[a.agent] || "#888",
                      }}
                    />
                    <span className="truncate">{a.label}</span>
                    {isBest && (
                      <span className="text-[9px] bg-green-800/40 text-green-300 px-1.5 py-0.5 rounded-full ml-1">
                        BEST
                      </span>
                    )}
                  </td>
                  <td className="text-right py-2 px-2 font-mono">
                    {a.delta_bps > 0 ? "+" : ""}
                    {a.delta_bps}
                  </td>
                  <td className="text-right py-2 px-2">
                    {a.metrics.mean_stress.toFixed(4)}
                  </td>
                  <td className="text-right py-2 px-2">
                    {a.metrics.mean_growth_penalty.toFixed(4)}
                  </td>
                  <td className="text-right py-2 px-2">
                    {a.metrics.mean_es95.toFixed(4)}
                  </td>
                  <td className="text-right py-2 px-2">
                    {(a.metrics.crisis_end * 100).toFixed(1)}%
                  </td>
                  <td className="text-right py-2 px-2 font-bold font-mono">
                    {a.metrics.total_loss.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Charts ────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {/* Stress paths */}
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Median Stress Path
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {agents.map((a) => (
                <Line
                  key={a.agent}
                  type="monotone"
                  dataKey={a.agent}
                  stroke={AGENT_COLORS[a.agent] || "#888"}
                  strokeWidth={2}
                  dot={false}
                  name={a.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Crisis probability */}
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Crisis Probability (%)
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={crisisData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {agents.map((a) => (
                <Line
                  key={a.agent}
                  type="monotone"
                  dataKey={a.agent}
                  stroke={AGENT_COLORS[a.agent] || "#888"}
                  strokeWidth={2}
                  dot={false}
                  name={a.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Growth paths */}
        <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Median Growth Path
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="step" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {agents.map((a) => (
                <Line
                  key={a.agent}
                  type="monotone"
                  dataKey={a.agent}
                  stroke={AGENT_COLORS[a.agent] || "#888"}
                  strokeWidth={2}
                  dot={false}
                  name={a.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
