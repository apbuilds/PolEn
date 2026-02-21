import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";
import InfoTooltip from "./InfoTooltip";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface TrainingState {
  status: string;
  progress: number;
  total_timesteps: number;
  current_timesteps: number;
  elapsed_seconds: number;
  reward_history: { timestep: number; mean_reward: number }[];
  loss_history: { timestep: number; loss: number }[];
  error: string | null;
  checkpoint_path: string | null;
}

interface EvalResult {
  rl: {
    avg_episode_reward: number;
    std_episode_reward: number;
    crisis_frequency: number;
    es95_stress: number;
    mean_stress: number;
    mean_inflation_gap: number;
    mean_abs_action_pct: number;
    std_action_pct: number;
    n_episodes: number;
    total_steps: number;
  };
  heuristic: {
    avg_episode_reward: number;
    std_episode_reward: number;
    crisis_frequency: number;
    es95_stress: number;
    mean_stress: number;
    mean_inflation_gap: number;
    mean_abs_action_pct: number;
    std_action_pct: number;
    n_episodes: number;
    total_steps: number;
  };
  comparison_summary: {
    reward_advantage: number;
    crisis_frequency_delta: number;
    rl_better_reward: boolean;
    rl_fewer_crises: boolean;
  };
}

interface ModelInfo {
  checkpoint_exists: boolean;
  size_mb: number;
  last_modified: number | null;
  config: Record<string, any>;
}

export default function RLTrainingPanel() {
  const [training, setTraining] = useState<TrainingState | null>(null);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Training parameters
  const [trainSteps, setTrainSteps] = useState(100000);
  const [trainLR, setTrainLR] = useState(0.0003);
  const [trainGamma, setTrainGamma] = useState(0.99);
  const [trainEntCoef, setTrainEntCoef] = useState(0.01);

  // Load model info on mount
  useEffect(() => {
    fetchModelInfo();
    fetchCachedEval();
  }, []);

  const fetchModelInfo = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rl/model/info`);
      if (res.ok) setModelInfo(await res.json());
    } catch {}
  };

  const fetchCachedEval = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rl/evaluate/cached`);
      if (res.ok) setEvalResult(await res.json());
    } catch {}
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/rl/status`);
      if (res.ok) {
        const data: TrainingState = await res.json();
        setTraining(data);
        if (data.status === "completed" || data.status === "failed" || data.status === "idle") {
          setIsTraining(false);
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (data.status === "completed") fetchModelInfo();
        }
      }
    } catch {}
  }, []);

  const startTraining = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rl/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total_timesteps: trainSteps,
          learning_rate: trainLR,
          gamma: trainGamma,
          ent_coef: trainEntCoef,
        }),
      });
      if (res.ok) {
        setIsTraining(true);
        // Start polling
        pollRef.current = setInterval(pollStatus, 2000);
      }
    } catch (e) {
      console.error("Failed to start training:", e);
    }
  };

  const stopTraining = async () => {
    try {
      await fetch(`${API_URL}/api/rl/stop`, { method: "POST" });
    } catch {}
  };

  const runEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch(`${API_URL}/api/rl/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n_episodes: 20, seed: 42 }),
      });
      if (res.ok) {
        setEvalResult(await res.json());
      }
    } catch (e) {
      console.error("Evaluation failed:", e);
    } finally {
      setIsEvaluating(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const statusColor = {
    idle: "bg-slate-600",
    training: "bg-amber-500 animate-pulse",
    stopping: "bg-orange-500 animate-pulse",
    completed: "bg-emerald-500",
    failed: "bg-red-500",
  }[training?.status || "idle"] || "bg-slate-600";

  const rewardData = training?.reward_history || [];
  const lossData = training?.loss_history || [];

  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-800/60 hover:bg-slate-800/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">🧠</span>
          <h3 className="text-sm font-bold text-slate-200">RL Training & Evaluation</h3>
          <InfoTooltip text="Control PPO reinforcement learning training and compare RL agent performance against the heuristic Monte Carlo optimizer." />
          <span className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            {training?.status || "idle"}
          </span>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-5 py-4 space-y-5">
          {/* Model Info Bar */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
            <div className={`w-2.5 h-2.5 rounded-full ${modelInfo?.checkpoint_exists ? "bg-emerald-400 glow-green" : "bg-red-400 glow-red"}`} />
            <span className="text-xs text-slate-300">
              {modelInfo?.checkpoint_exists
                ? `Model checkpoint: ${modelInfo.size_mb} MB`
                : "No trained model — train one below"}
            </span>
            {modelInfo?.config && (
              <span className="text-[10px] text-slate-500 ml-auto">
                arch=[{modelInfo.config.net_arch?.join(",")}] γ={modelInfo.config.gamma}
              </span>
            )}
          </div>

          {/* Training Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase">Training Parameters</h4>
              <InfoTooltip text="Configure PPO hyperparameters. More timesteps = longer training but better convergence. Lower learning rate = more stable but slower learning." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 flex justify-between mb-1">
                  <span>Timesteps</span>
                  <span className="font-mono">{(trainSteps / 1000).toFixed(0)}K</span>
                </label>
                <input
                  type="range"
                  min={10000}
                  max={1000000}
                  step={10000}
                  value={trainSteps}
                  onChange={(e) => setTrainSteps(Number(e.target.value))}
                  className="w-full"
                  disabled={isTraining}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex justify-between mb-1">
                  <span>Learning Rate</span>
                  <span className="font-mono">{trainLR.toExponential(1)}</span>
                </label>
                <input
                  type="range"
                  min={0.00001}
                  max={0.01}
                  step={0.00001}
                  value={trainLR}
                  onChange={(e) => setTrainLR(Number(e.target.value))}
                  className="w-full"
                  disabled={isTraining}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex justify-between mb-1">
                  <span>Discount (γ)</span>
                  <span className="font-mono">{trainGamma.toFixed(3)}</span>
                </label>
                <input
                  type="range"
                  min={0.9}
                  max={0.999}
                  step={0.001}
                  value={trainGamma}
                  onChange={(e) => setTrainGamma(Number(e.target.value))}
                  className="w-full"
                  disabled={isTraining}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex justify-between mb-1">
                  <span>Entropy Coef</span>
                  <span className="font-mono">{trainEntCoef.toFixed(3)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.1}
                  step={0.001}
                  value={trainEntCoef}
                  onChange={(e) => setTrainEntCoef(Number(e.target.value))}
                  className="w-full"
                  disabled={isTraining}
                />
              </div>
            </div>

            {/* Train / Stop Buttons */}
            <div className="flex gap-2">
              {!isTraining ? (
                <button
                  onClick={startTraining}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2"
                >
                  <span>🚀</span> Start Training
                </button>
              ) : (
                <button
                  onClick={stopTraining}
                  className="flex-1 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-red-900/30 flex items-center justify-center gap-2"
                >
                  <span>⏹</span> Stop Training
                </button>
              )}
              <button
                onClick={runEvaluation}
                disabled={isEvaluating || isTraining}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
              >
                {isEvaluating ? (
                  <><span className="animate-spin">⚙</span> Evaluating...</>
                ) : (
                  <><span>📊</span> Evaluate</>
                )}
              </button>
            </div>
          </div>

          {/* Training Progress */}
          {training && training.status !== "idle" && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>{training.current_timesteps.toLocaleString()} / {training.total_timesteps.toLocaleString()} steps</span>
                  <span>{Math.round(training.progress * 100)}% · {Math.round(training.elapsed_seconds)}s</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                    style={{ width: `${training.progress * 100}%` }}
                  />
                </div>
              </div>

              {/* Reward Curve */}
              {rewardData.length > 1 && (
                <div className="bg-slate-800/40 rounded-lg border border-slate-700/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Training Reward Curve</h4>
                    <InfoTooltip text="Mean episode reward over training. Higher is better — the agent is learning to minimize stress and inflation gap while avoiding crises." />
                  </div>
                  <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={rewardData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="timestep"
                        stroke="#475569"
                        tick={{ fontSize: 8 }}
                        tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                      />
                      <YAxis stroke="#475569" tick={{ fontSize: 8 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 10 }}
                        formatter={(v: number) => v.toFixed(2)}
                      />
                      <Line
                        type="monotone"
                        dataKey="mean_reward"
                        stroke="#818cf8"
                        strokeWidth={2}
                        dot={false}
                        name="Mean Reward"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Loss Curve */}
              {lossData.length > 1 && (
                <div className="bg-slate-800/40 rounded-lg border border-slate-700/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase">Training Loss</h4>
                    <InfoTooltip text="PPO policy+value loss. Should generally decrease during training, indicating the model is learning." />
                  </div>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={lossData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="timestep"
                        stroke="#475569"
                        tick={{ fontSize: 8 }}
                        tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                      />
                      <YAxis stroke="#475569" tick={{ fontSize: 8 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 10 }}
                        formatter={(v: number) => v.toFixed(4)}
                      />
                      <Line type="monotone" dataKey="loss" stroke="#f97316" strokeWidth={1.5} dot={false} name="Loss" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Error display */}
              {training.error && (
                <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">
                  ⚠ {training.error}
                </div>
              )}
            </div>
          )}

          {/* Evaluation Results */}
          {evalResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase">RL vs Heuristic Comparison</h4>
                <InfoTooltip text="Side-by-side performance comparison of the trained RL agent against the rule-based heuristic policy across multiple episodes." />
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className={`rounded-lg p-3 border ${evalResult.comparison_summary.rl_better_reward ? "bg-emerald-900/20 border-emerald-700/40" : "bg-red-900/20 border-red-700/40"}`}>
                  <div className="text-[10px] text-slate-400">Reward Advantage</div>
                  <div className={`text-lg font-mono font-bold ${evalResult.comparison_summary.rl_better_reward ? "text-emerald-400" : "text-red-400"}`}>
                    {evalResult.comparison_summary.reward_advantage > 0 ? "+" : ""}
                    {evalResult.comparison_summary.reward_advantage.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {evalResult.comparison_summary.rl_better_reward ? "RL agent outperforms" : "Heuristic outperforms"}
                  </div>
                </div>
                <div className={`rounded-lg p-3 border ${evalResult.comparison_summary.rl_fewer_crises ? "bg-emerald-900/20 border-emerald-700/40" : "bg-red-900/20 border-red-700/40"}`}>
                  <div className="text-[10px] text-slate-400">Crisis Freq Δ</div>
                  <div className={`text-lg font-mono font-bold ${evalResult.comparison_summary.rl_fewer_crises ? "text-emerald-400" : "text-red-400"}`}>
                    {(evalResult.comparison_summary.crisis_frequency_delta * 100).toFixed(1)}%
                  </div>
                  <div className="text-[9px] text-slate-500">
                    {evalResult.comparison_summary.rl_fewer_crises ? "RL has fewer crises" : "Heuristic has fewer crises"}
                  </div>
                </div>
              </div>

              {/* Detailed Comparison Bar Chart */}
              <div className="bg-slate-800/40 rounded-lg border border-slate-700/30 p-3">
                <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-2">Performance Metrics</h5>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={[
                      {
                        name: "Avg Reward",
                        rl: evalResult.rl.avg_episode_reward,
                        heuristic: evalResult.heuristic.avg_episode_reward,
                      },
                      {
                        name: "Crisis %",
                        rl: -evalResult.rl.crisis_frequency * 100,
                        heuristic: -evalResult.heuristic.crisis_frequency * 100,
                      },
                      {
                        name: "ES95",
                        rl: -evalResult.rl.es95_stress,
                        heuristic: -evalResult.heuristic.es95_stress,
                      },
                      {
                        name: "Infl Gap",
                        rl: -Math.abs(evalResult.rl.mean_inflation_gap) * 100,
                        heuristic: -Math.abs(evalResult.heuristic.mean_inflation_gap) * 100,
                      },
                    ]}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#475569" tick={{ fontSize: 8 }} />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#475569"
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 10 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="rl" name="🤖 RL Agent" fill="#818cf8" radius={[0, 3, 3, 0]} barSize={10} />
                    <Bar dataKey="heuristic" name="🎲 Heuristic" fill="#64748b" radius={[0, 3, 3, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed Stats Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-700/50">
                      <th className="text-left py-1.5 px-2">Metric</th>
                      <th className="text-right py-1.5 px-2">🤖 RL</th>
                      <th className="text-right py-1.5 px-2">🎲 Heuristic</th>
                      <th className="text-right py-1.5 px-2">Winner</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {[
                      { label: "Avg Reward", rl: evalResult.rl.avg_episode_reward, h: evalResult.heuristic.avg_episode_reward, higher: true, fmt: 2 },
                      { label: "Reward σ", rl: evalResult.rl.std_episode_reward, h: evalResult.heuristic.std_episode_reward, higher: false, fmt: 2 },
                      { label: "Crisis Freq", rl: evalResult.rl.crisis_frequency * 100, h: evalResult.heuristic.crisis_frequency * 100, higher: false, fmt: 1, suffix: "%" },
                      { label: "ES95 Stress", rl: evalResult.rl.es95_stress, h: evalResult.heuristic.es95_stress, higher: false, fmt: 3 },
                      { label: "Mean Stress", rl: evalResult.rl.mean_stress, h: evalResult.heuristic.mean_stress, higher: false, fmt: 3 },
                      { label: "Infl Gap", rl: Math.abs(evalResult.rl.mean_inflation_gap) * 100, h: Math.abs(evalResult.heuristic.mean_inflation_gap) * 100, higher: false, fmt: 2, suffix: "%" },
                      { label: "Action |Δ|", rl: evalResult.rl.mean_abs_action_pct, h: evalResult.heuristic.mean_abs_action_pct, higher: false, fmt: 3 },
                    ].map((row) => {
                      const rlBetter = row.higher ? row.rl > row.h : row.rl < row.h;
                      return (
                        <tr key={row.label} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-1.5 px-2 text-slate-400">{row.label}</td>
                          <td className={`text-right py-1.5 px-2 font-mono ${rlBetter ? "text-emerald-400 font-bold" : ""}`}>
                            {row.rl.toFixed(row.fmt)}{row.suffix || ""}
                          </td>
                          <td className={`text-right py-1.5 px-2 font-mono ${!rlBetter ? "text-emerald-400 font-bold" : ""}`}>
                            {row.h.toFixed(row.fmt)}{row.suffix || ""}
                          </td>
                          <td className="text-right py-1.5 px-2">
                            {rlBetter ? "🤖" : "🎲"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
