import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { StepData } from "../pages/index";

interface LiveSimulationProps {
  data: StepData[];
  compareData: StepData[] | null;
  compareMode: boolean;
  isRunning: boolean;
  H: number;
}

export default function LiveSimulation({
  data,
  compareData,
  compareMode,
  isRunning,
  H,
}: LiveSimulationProps) {
  // Transform data for Recharts — use [low, high] range format for proper bands
  const stressFanData = useMemo(() => {
    return data.map((d) => ({
      month: d.step,
      outer: [d.stress_fan.p5, d.stress_fan.p95],
      inner: [d.stress_fan.p25, d.stress_fan.p75],
      p50: d.stress_fan.p50,
    }));
  }, [data]);

  const growthFanData = useMemo(() => {
    return data.map((d) => ({
      month: d.step,
      outer: [d.growth_fan.p5, d.growth_fan.p95],
      inner: [d.growth_fan.p25, d.growth_fan.p75],
      p50: d.growth_fan.p50,
    }));
  }, [data]);

  const crisisProbData = useMemo(() => {
    const result = data.map((d) => ({
      month: d.step,
      crisis_prob: d.crisis_prob * 100,
      es95: d.es95_stress,
    }));
    if (compareMode && compareData) {
      return result.map((d, i) => ({
        ...d,
        crisis_prob_A: compareData[i]?.crisis_prob ? compareData[i].crisis_prob * 100 : undefined,
      }));
    }
    return result;
  }, [data, compareData, compareMode]);

  // Spaghetti paths
  const spaghettiData = useMemo(() => {
    if (data.length === 0) return [];
    const numPaths = data[0]?.spaghetti?.length || 0;
    return data.map((d) => {
      const row: Record<string, number> = { month: d.step };
      d.spaghetti?.forEach((s) => {
        row[`path_${s.id}`] = s.stress;
      });
      return row;
    });
  }, [data]);

  const spaghettiPathIds = useMemo(() => {
    if (data.length === 0) return [];
    return data[0]?.spaghetti?.map((s) => `path_${s.id}`) || [];
  }, [data]);

  // Compare overlay data
  const compareStressData = useMemo(() => {
    if (!compareMode || !compareData) return null;
    return compareData.map((d) => ({
      month: d.step,
      p50_A: d.stress_fan.p50,
    }));
  }, [compareData, compareMode]);

  if (data.length === 0 && !isRunning) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <p className="text-4xl mb-3">📈</p>
          <p className="text-lg">Configure parameters and press Run</p>
          <p className="text-sm mt-1">Watch Monte Carlo paths simulate live</p>
        </div>
      </div>
    );
  }

  const stepIndicator = data.length > 0 ? data[data.length - 1].step : 0;

  return (
    <div className="space-y-4">
      {/* Step indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase">Live Simulation</h2>
          {isRunning && (
            <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded animate-pulse">
              STREAMING
            </span>
          )}
        </div>
        <div className="text-sm text-slate-400">
          Step <span className="font-mono font-bold text-slate-200">{stepIndicator}</span> / {H}
          <div className="w-48 h-1.5 bg-slate-700 rounded-full inline-block ml-3 align-middle">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-200"
              style={{ width: `${(stepIndicator / H) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* STRESS FAN CHART */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">
          Stress Factor — Fan Chart
          {compareMode && compareData && (
            <span className="text-purple-400 ml-2">(dashed = Run A)</span>
          )}
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={stressFanData}>
            <defs>
              <linearGradient id="stressOuter" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="50%" stopColor="#ef4444" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
              </linearGradient>
              <linearGradient id="stressInner" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity={0.45} />
                <stop offset="50%" stopColor="#f97316" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0.45} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              tick={{ fontSize: 10 }}
              label={{ value: "Month", position: "insideBottom", offset: -5, fontSize: 10, fill: "#64748b" }}
            />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(l: string | number) => `Month ${l}`}
            />
            {/* Outer band (p5-p95) */}
            <Area
              type="monotone"
              dataKey="outer"
              stroke="#ef444466"
              strokeWidth={0.5}
              fill="url(#stressOuter)"
              fillOpacity={1}
              name="p5–p95"
              isAnimationActive={false}
            />
            {/* Inner band (p25-p75) */}
            <Area
              type="monotone"
              dataKey="inner"
              stroke="#f9731966"
              strokeWidth={0.5}
              fill="url(#stressInner)"
              fillOpacity={1}
              name="p25–p75"
              isAnimationActive={false}
            />
            {/* Median */}
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
              name="Median Stress"
            />
            {/* Spaghetti paths */}
            {spaghettiPathIds.slice(0, 15).map((pathId, idx) => (
              <Line
                key={pathId}
                type="monotone"
                data={spaghettiData}
                dataKey={pathId}
                stroke={`hsla(${(idx * 24) % 360}, 60%, 60%, 0.15)`}
                strokeWidth={0.5}
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            ))}
            {/* Compare overlay */}
            {compareMode && compareStressData && (
              <Line
                type="monotone"
                data={compareStressData}
                dataKey="p50_A"
                stroke="#a78bfa"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={false}
                name="Run A Median"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* GROWTH FAN CHART */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Growth Factor — Fan Chart</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={growthFanData}>
            <defs>
              <linearGradient id="growthOuter" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="50%" stopColor="#22c55e" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.25} />
              </linearGradient>
              <linearGradient id="growthInner" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ade80" stopOpacity={0.45} />
                <stop offset="50%" stopColor="#4ade80" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#4ade80" stopOpacity={0.45} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(l: string | number) => `Month ${l}`}
            />
            {/* Outer band (p5-p95) */}
            <Area
              type="monotone"
              dataKey="outer"
              stroke="#22c55e66"
              strokeWidth={0.5}
              fill="url(#growthOuter)"
              fillOpacity={1}
              name="p5–p95"
              isAnimationActive={false}
            />
            {/* Inner band (p25-p75) */}
            <Area
              type="monotone"
              dataKey="inner"
              stroke="#4ade8066"
              strokeWidth={0.5}
              fill="url(#growthInner)"
              fillOpacity={1}
              name="p25–p75"
              isAnimationActive={false}
            />
            {/* Median */}
            <Line type="monotone" dataKey="p50" stroke="#22c55e" strokeWidth={2.5} dot={false} name="Median Growth" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* CRISIS PROBABILITY + ES95 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Crisis Probability (%)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={crisisProbData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }}
                labelFormatter={(l: string | number) => `Month ${l}`}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Line type="monotone" dataKey="crisis_prob" stroke="#ef4444" strokeWidth={2} dot={false} name="Crisis %" />
              {compareMode && (
                <Line
                  type="monotone"
                  dataKey="crisis_prob_A"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  name="Run A"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Expected Shortfall (ES95)</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={crisisProbData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #475569", borderRadius: 8, fontSize: 11 }}
                labelFormatter={(l: string | number) => `Month ${l}`}
              />
              <Line type="monotone" dataKey="es95" stroke="#f59e0b" strokeWidth={2} dot={false} name="ES95 Stress" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary stats at current step */}
      {data.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Stress p50",
              value: data[data.length - 1].stress_fan.p50.toFixed(3),
              color: "text-red-400",
            },
            {
              label: "Growth p50",
              value: data[data.length - 1].growth_fan.p50.toFixed(3),
              color: "text-green-400",
            },
            {
              label: "Crisis Prob",
              value: `${(data[data.length - 1].crisis_prob * 100).toFixed(1)}%`,
              color: data[data.length - 1].crisis_prob > 0.3 ? "text-red-400" : "text-yellow-400",
            },
            {
              label: "ES95",
              value: data[data.length - 1].es95_stress.toFixed(3),
              color: "text-amber-400",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-800 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400">{stat.label}</div>
              <div className={`text-lg font-mono font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
