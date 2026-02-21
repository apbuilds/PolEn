import React, { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import PolicyControls from "../components/PolicyControls";
import LiveSimulation from "../components/LiveSimulation";
import CorrelationHeatmap from "../components/CorrelationHeatmap";
import EigenSpectrum from "../components/EigenSpectrum";
import PolicyComparisonTable from "../components/PolicyComparisonTable";
import RLTrainingPanel from "../components/RLTrainingPanel";
import FedPolicyDashboard from "../components/FedPolicyDashboard";
import InfoTooltip from "../components/InfoTooltip";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001";

// Types
export interface StepData {
  step: number;
  H: number;
  stress_fan: { p5: number; p25: number; p50: number; p75: number; p95: number };
  growth_fan: { p5: number; p25: number; p50: number; p75: number; p95: number };
  crisis_prob: number;
  es95_stress: number;
  spaghetti: { id: number; stress: number }[];
  done?: boolean;
}

export interface MacroState {
  latest_date: string;
  is_synthetic: boolean;
  mu_T: number[];
  P_T: number[][];
  stress_score: number;
  regime_label: string;
  crisis_threshold: number;
  inflation_gap?: number;
  fed_rate?: number;
  metrics: Record<string, number>;
  correlation_matrix: number[][];
  correlation_labels: string[];
  eigenvalues: number[];
}

export interface PolicyComparison {
  recommended_action: string;
  recommended_bps: number;
  explanation: string;
  comparison: {
    action: string;
    delta_bps: number;
    mean_stress: number;
    mean_growth_penalty: number;
    mean_es95: number;
    crisis_end: number;
    total_loss: number;
  }[];
  weights: { alpha: number; beta: number; gamma: number; lambda: number };
}

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

type BottomTab = "structure" | "fed_policy" | "rl_training";

export default function Home() {
  // State
  const [macroState, setMacroState] = useState<MacroState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [simulationData, setSimulationData] = useState<StepData[]>([]);
  const [compareDataA, setCompareDataA] = useState<StepData[] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyComparison | null>(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [baselineCrisisProb, setBaselineCrisisProb] = useState<number | null>(null);
  const [policyMode, setPolicyMode] = useState<"heuristic" | "rl">("heuristic");
  const [bottomTab, setBottomTab] = useState<BottomTab>("structure");

  const wsRef = useRef<WebSocket | null>(null);

  const [params, setParams] = useState<SimParams>({
    delta_bps: 0,
    alpha: 1.0,
    beta: 1.0,
    gamma: 1.0,
    lambda: 1.0,
    N: 5000,
    H: 24,
    speed_ms: 120,
    shocks: { credit: 0, vol: 0, rate: 0 },
    regime_switching: true,
  });

  // Initialize: refresh state on mount
  useEffect(() => {
    refreshState();
  }, []);

  const refreshState = async () => {
    setLoading(true);
    setError(null);
    try {
      const refreshRes = await fetch(`${API_URL}/api/state/refresh`, { method: "POST" });
      if (!refreshRes.ok) {
        const err = await refreshRes.json();
        throw new Error(err.detail || "Failed to refresh state");
      }
      const stateRes = await fetch(`${API_URL}/api/state/current`);
      if (!stateRes.ok) throw new Error("Failed to get current state");
      const state: MacroState = await stateRes.json();
      setMacroState(state);
      try {
        const modeRes = await fetch(`${API_URL}/api/policy/mode`);
        if (modeRes.ok) {
          const modeData = await modeRes.json();
          setPolicyMode(modeData.mode || "heuristic");
        }
      } catch { /* ignore */ }
      runBaselineSimulation();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePolicyModeChange = async (mode: "heuristic" | "rl") => {
    try {
      const res = await fetch(`${API_URL}/api/policy/set_mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) setPolicyMode(mode);
    } catch (e) {
      console.error("Failed to set policy mode:", e);
    }
  };

  const runBaselineSimulation = () => {
    try {
      const ws = new WebSocket(`${WS_URL}/ws/simulate`);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          delta_bps: 0, N: 2000, H: 12, speed_ms: 10,
          regime_switching: true, shocks: { credit: 0, vol: 0, rate: 0 },
        }));
      };
      const baselineSteps: StepData[] = [];
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.done && !data.step) {
          ws.close();
          if (baselineSteps.length > 0) {
            const avg = baselineSteps.reduce((s, d) => s + d.crisis_prob, 0) / baselineSteps.length;
            setBaselineCrisisProb(avg);
          }
          return;
        }
        if (data.step) baselineSteps.push(data as StepData);
      };
      ws.onerror = () => ws.close();
    } catch { /* Baseline is optional */ }
  };

  const handleRun = useCallback(() => {
    if (compareMode && simulationData.length > 0 && !compareDataA) {
      setCompareDataA([...simulationData]);
    }
    setSimulationData([]);
    setIsRunning(true);
    setError(null);
    const ws = new WebSocket(`${WS_URL}/ws/simulate`);
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({
        delta_bps: params.delta_bps, N: params.N, H: params.H,
        speed_ms: params.speed_ms, shocks: params.shocks,
        regime_switching: params.regime_switching,
      }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) { setError(data.error); setIsRunning(false); return; }
      if (data.done && !data.step) { setIsRunning(false); return; }
      if (data.step) setSimulationData(prev => [...prev, data as StepData]);
    };
    ws.onerror = () => { setIsRunning(false); setError("WebSocket connection failed"); };
    ws.onclose = () => { setIsRunning(false); wsRef.current = null; };
  }, [params, compareMode, simulationData, compareDataA]);

  const handlePause = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setIsRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    handlePause();
    setSimulationData([]);
    setCompareDataA(null);
    setPolicyResult(null);
    setShowPolicyModal(false);
  }, [handlePause]);

  const handleCompareToggle = useCallback(() => {
    if (!compareMode) {
      if (simulationData.length > 0) setCompareDataA([...simulationData]);
    } else {
      setCompareDataA(null);
    }
    setCompareMode(!compareMode);
  }, [compareMode, simulationData]);

  const handleRecommend = async () => {
    setRecommendLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/policy/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alpha: params.alpha, beta: params.beta, gamma: params.gamma, lambda: params.lambda,
          N: Math.min(params.N, 3000), H: params.H,
          shocks: params.shocks, regime_switching: params.regime_switching,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Recommendation failed");
      }
      const result: PolicyComparison = await res.json();
      setPolicyResult(result);
      setShowPolicyModal(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecommendLoading(false);
    }
  };

  const regimeColor = macroState?.regime_label === "Normal"
    ? "from-green-600 to-emerald-600" : macroState?.regime_label === "Fragile"
    ? "from-yellow-600 to-amber-600" : "from-red-600 to-rose-600";

  const regimeBg = macroState?.regime_label === "Normal"
    ? "bg-green-600" : macroState?.regime_label === "Fragile"
    ? "bg-yellow-600" : "bg-red-600";

  const latentLabels = ["Stress", "Liquidity", "Growth", "Infl. Gap"];

  const bottomTabs: { key: BottomTab; label: string; icon: string }[] = [
    { key: "structure", label: "Cross-Asset Structure", icon: "📊" },
    { key: "fed_policy", label: "Fed Policy Monitor", icon: "🏛" },
    { key: "rl_training", label: "RL Training Lab", icon: "🧠" },
  ];

  return (
    <>
      <Head>
        <title>PolEn | Policy Engine Control Room</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* ════════ TOP BAR ════════ */}
        <header className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 border-b border-slate-700/50 px-6 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-black tracking-tight">
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                PolEn
              </span>
              <span className="text-slate-500 font-normal text-sm ml-2">Policy Engine</span>
            </h1>
            {macroState?.is_synthetic && (
              <span className="text-[10px] bg-amber-800/60 text-amber-200 px-2 py-0.5 rounded-full border border-amber-700/40 font-medium">
                SYNTHETIC
              </span>
            )}
          </div>

          <div className="flex items-center gap-5 text-xs">
            {macroState && (
              <>
                <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                  <span className="text-slate-500">Date</span>
                  <span className="font-mono text-slate-300">{macroState.latest_date}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                  <span className="text-slate-500">Regime</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r ${regimeColor} text-white`}>
                    {macroState.regime_label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                  <span className="text-slate-500">Crisis</span>
                  <span className={`font-mono font-bold ${
                    (baselineCrisisProb ?? 0) > 0.3 ? "text-red-400" :
                    (baselineCrisisProb ?? 0) > 0.1 ? "text-yellow-400" : "text-green-400"
                  }`}>
                    {baselineCrisisProb !== null ? `${(baselineCrisisProb * 100).toFixed(1)}%` : "\u2014"}
                  </span>
                </div>
                {macroState.inflation_gap !== undefined && (
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                    <span className="text-slate-500">Infl\u00a0Gap</span>
                    <span className={`font-mono font-bold ${
                      Math.abs(macroState.inflation_gap) > 0.02 ? "text-red-400" :
                      Math.abs(macroState.inflation_gap) > 0.01 ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {(macroState.inflation_gap * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {macroState.fed_rate !== undefined && (
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                    <span className="text-slate-500">Fed</span>
                    <span className="font-mono text-slate-300">{(macroState.fed_rate * 100).toFixed(2)}%</span>
                  </div>
                )}
              </>
            )}
            <button onClick={refreshState} disabled={loading}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 px-4 py-1.5 rounded-lg text-white text-xs font-medium transition-all shadow-md shadow-indigo-900/20">
              {loading ? "\u21BB Refreshing..." : "\u21BB Refresh"}
            </button>
          </div>
        </header>

        {/* ERROR BANNER */}
        {error && (
          <div className="bg-red-900/40 border-b border-red-800/50 px-6 py-2 text-red-200 text-sm flex items-center justify-between backdrop-blur-sm flex-shrink-0">
            <span className="flex items-center gap-2"><span className="text-red-400">\u26a0</span> {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 transition-colors">\u2715</button>
          </div>
        )}

        {/* ════════ MAIN AREA ════════ */}
        <div className="flex flex-1 min-h-0">
          {/* LEFT PANEL: Controls */}
          <aside className="w-80 flex-shrink-0 bg-slate-900/80 border-r border-slate-700/30 overflow-y-auto p-4 scrollbar-thin">
            <PolicyControls
              params={params}
              setParams={setParams}
              onRun={handleRun}
              onPause={handlePause}
              onReset={handleReset}
              onRecommend={handleRecommend}
              onCompareToggle={handleCompareToggle}
              isRunning={isRunning}
              compareMode={compareMode}
              recommendLoading={recommendLoading}
              policyMode={policyMode}
              onPolicyModeChange={handlePolicyModeChange}
            />
          </aside>

          {/* CENTER AREA */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* TOP: Simulation */}
            <main className="flex-1 min-h-0 overflow-y-auto p-4">
              {!macroState && !loading && (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center space-y-3">
                    <div className="text-5xl opacity-30">\ud83c\udf10</div>
                    <p className="text-xl font-semibold text-slate-300">No state loaded</p>
                    <p className="text-sm">Click <span className="text-indigo-400 font-medium">"Refresh"</span> to load data and initialize the model.</p>
                  </div>
                </div>
              )}
              {loading && (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center space-y-3">
                    <div className="animate-spin text-4xl">\u2699</div>
                    <p className="text-sm">Loading data, running pipeline & Kalman filter...</p>
                  </div>
                </div>
              )}
              {macroState && !loading && (
                <LiveSimulation
                  data={simulationData}
                  compareData={compareDataA}
                  compareMode={compareMode}
                  isRunning={isRunning}
                  H={params.H}
                />
              )}
            </main>

            {/* BOTTOM: Tabbed Panel */}
            <div className="flex-shrink-0 border-t border-slate-700/30 bg-slate-900/60 backdrop-blur-sm">
              {/* Tab Bar */}
              <div className="flex items-center gap-1 px-4 pt-2 border-b border-slate-700/20">
                {bottomTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setBottomTab(tab.key)}
                    className={`px-4 py-2 text-xs font-medium rounded-t-lg transition-all flex items-center gap-1.5 ${
                      bottomTab === tab.key
                        ? "bg-slate-800 text-indigo-300 border-t-2 border-x border-indigo-500 border-x-slate-700/30"
                        : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="h-[340px] overflow-y-auto p-4">
                {bottomTab === "structure" && macroState && (
                  <div className="grid grid-cols-3 gap-4 h-full">
                    {/* Correlation Heatmap */}
                    <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correlation Matrix</h4>
                        <InfoTooltip text="Cross-asset correlation matrix computed from rolling window of monthly returns." />
                      </div>
                      <CorrelationHeatmap matrix={macroState.correlation_matrix} labels={macroState.correlation_labels} />
                    </div>

                    {/* Eigen Spectrum */}
                    <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eigenvalue Spectrum</h4>
                        <InfoTooltip text="PCA eigenvalues showing the variance explained by each principal component of the macro system." />
                      </div>
                      <EigenSpectrum eigenvalues={macroState.eigenvalues} labels={macroState.correlation_labels} />
                    </div>

                    {/* Latent State + Metrics */}
                    <div className="space-y-3">
                      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Latent State \u03bc_T</h4>
                          <InfoTooltip text="Kalman-filtered latent state vector: Stress, Liquidity, Growth, and Inflation Gap dimensions." />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {latentLabels.map((label, i) => {
                            const val = macroState.mu_T[i];
                            const color = i === 0 ? "text-red-400" : i === 1 ? "text-blue-400" : i === 2 ? "text-green-400" : "text-amber-400";
                            return (
                              <div key={label} className="bg-slate-900/60 rounded-lg p-2 text-center">
                                <div className={"text-[10px] " + color + " font-medium"}>{label}</div>
                                <div className="font-mono font-bold text-sm">{val?.toFixed(3) ?? "\u2014"}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Key Metrics</h4>
                          <InfoTooltip text="Real-time macro metrics derived from the data pipeline and Kalman filter." />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] max-h-[120px] overflow-y-auto">
                          {Object.entries(macroState.metrics).map(([k, v]) => (
                            <div key={k} className="bg-slate-900/60 rounded px-2 py-1.5 flex justify-between">
                              <span className="text-slate-500 truncate mr-2">{k}</span>
                              <span className="font-mono font-bold text-slate-300">{v.toFixed(4)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {bottomTab === "structure" && !macroState && (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    Load data to view cross-asset structure analysis
                  </div>
                )}

                {bottomTab === "fed_policy" && macroState && (
                  <FedPolicyDashboard
                    inflationGap={macroState.inflation_gap ?? 0}
                    fedRate={macroState.fed_rate ?? 0}
                    stressScore={macroState.stress_score}
                    regimeLabel={macroState.regime_label}
                    crisisThreshold={macroState.crisis_threshold}
                    mu_T={macroState.mu_T}
                  />
                )}
                {bottomTab === "fed_policy" && !macroState && (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    Load data to view Fed policy analysis
                  </div>
                )}

                {bottomTab === "rl_training" && (
                  <RLTrainingPanel />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ════════ POLICY COMPARISON MODAL ════════ */}
        {showPolicyModal && policyResult && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-600/50 rounded-2xl shadow-2xl shadow-black/50 p-6 max-w-3xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                    Policy Recommendation
                  </h2>
                  <InfoTooltip text="Monte Carlo simulation results comparing different policy actions across your specified objective weights." />
                </div>
                <button onClick={() => setShowPolicyModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-xl transition-colors">
                  \u2715
                </button>
              </div>
              <PolicyComparisonTable
                result={policyResult}
                onSelect={(bps: number) => { setParams(p => ({ ...p, delta_bps: bps })); setShowPolicyModal(false); }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
