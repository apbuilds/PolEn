import React, { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import PolicyControls from "../components/PolicyControls";
import LiveSimulation from "../components/LiveSimulation";
import CorrelationHeatmap from "../components/CorrelationHeatmap";
import EigenSpectrum from "../components/EigenSpectrum";
import PolicyComparisonTable from "../components/PolicyComparisonTable";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

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
      // Refresh state
      const refreshRes = await fetch(`${API_URL}/api/state/refresh`, { method: "POST" });
      if (!refreshRes.ok) {
        const err = await refreshRes.json();
        throw new Error(err.detail || "Failed to refresh state");
      }

      // Get current state
      const stateRes = await fetch(`${API_URL}/api/state/current`);
      if (!stateRes.ok) throw new Error("Failed to get current state");
      const state: MacroState = await stateRes.json();
      setMacroState(state);

      // Run a quick baseline simulation for crisis probability
      runBaselineSimulation();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const runBaselineSimulation = () => {
    // Quick baseline sim to get crisis probability
    try {
      const ws = new WebSocket(`${WS_URL}/ws/simulate`);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          delta_bps: 0,
          N: 2000,
          H: 12,
          speed_ms: 10,
          regime_switching: true,
          shocks: { credit: 0, vol: 0, rate: 0 },
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
    } catch {
      // Baseline is optional
    }
  };

  const handleRun = useCallback(() => {
    // If compare mode, save current data as A before new run
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
        delta_bps: params.delta_bps,
        N: params.N,
        H: params.H,
        speed_ms: params.speed_ms,
        shocks: params.shocks,
        regime_switching: params.regime_switching,
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setError(data.error);
        setIsRunning(false);
        return;
      }
      if (data.done && !data.step) {
        setIsRunning(false);
        return;
      }
      if (data.step) {
        setSimulationData(prev => [...prev, data as StepData]);
      }
    };

    ws.onerror = () => {
      setIsRunning(false);
      setError("WebSocket connection failed");
    };

    ws.onclose = () => {
      setIsRunning(false);
      wsRef.current = null;
    };
  }, [params, compareMode, simulationData, compareDataA]);

  const handlePause = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
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
      // Entering compare mode: save current run as A
      if (simulationData.length > 0) {
        setCompareDataA([...simulationData]);
      }
    } else {
      // Exiting compare mode
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
          alpha: params.alpha,
          beta: params.beta,
          gamma: params.gamma,
          lambda: params.lambda,
          N: Math.min(params.N, 3000), // Faster for recommendation
          H: params.H,
          shocks: params.shocks,
          regime_switching: params.regime_switching,
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

  // Regime badge color
  const regimeColor = macroState?.regime_label === "Normal"
    ? "bg-green-600"
    : macroState?.regime_label === "Fragile"
    ? "bg-yellow-600"
    : "bg-red-600";

  return (
    <>
      <Head>
        <title>MacroState Control Room</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100">
        {/* TOP BAR */}
        <header className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-indigo-400">
              ⚡ MacroState Control Room
            </h1>
            {macroState?.is_synthetic && (
              <span className="text-xs bg-amber-700 text-amber-100 px-2 py-0.5 rounded">
                SYNTHETIC MODE
              </span>
            )}
          </div>
          <div className="flex items-center gap-6 text-sm">
            {macroState && (
              <>
                <div>
                  <span className="text-slate-400">Data Date: </span>
                  <span className="font-mono">{macroState.latest_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Regime:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${regimeColor}`}>
                    {macroState.regime_label}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">12M Crisis Prob: </span>
                  <span className={`font-mono font-bold ${
                    (baselineCrisisProb ?? 0) > 0.3 ? "text-red-400" :
                    (baselineCrisisProb ?? 0) > 0.1 ? "text-yellow-400" : "text-green-400"
                  }`}>
                    {baselineCrisisProb !== null ? `${(baselineCrisisProb * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              </>
            )}
            <button
              onClick={refreshState}
              disabled={loading}
              className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </header>

        {/* ERROR BANNER */}
        {error && (
          <div className="bg-red-900/50 border-b border-red-700 px-6 py-2 text-red-200 text-sm flex items-center justify-between">
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* MAIN LAYOUT */}
        <div className="flex h-[calc(100vh-56px)]">
          {/* LEFT PANEL: Controls */}
          <aside className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-700 overflow-y-auto p-4">
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
            />
          </aside>

          {/* CENTER: Live Simulation */}
          <main className="flex-1 overflow-y-auto p-4">
            {!macroState && !loading && (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <p className="text-2xl mb-2">No state loaded</p>
                  <p>Click "Refresh" to load data and initialize the model.</p>
                </div>
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <div className="animate-spin text-4xl mb-4">⚙</div>
                  <p>Loading data, running pipeline & Kalman filter...</p>
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

          {/* RIGHT PANEL: Structure */}
          <aside className="w-80 flex-shrink-0 bg-slate-900 border-l border-slate-700 overflow-y-auto p-4">
            {macroState && (
              <>
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-3">
                  Cross-Asset Structure
                </h3>
                <CorrelationHeatmap
                  matrix={macroState.correlation_matrix}
                  labels={macroState.correlation_labels}
                />
                <div className="mt-4">
                  <EigenSpectrum
                    eigenvalues={macroState.eigenvalues}
                    labels={macroState.correlation_labels}
                  />
                </div>
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Key Metrics</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(macroState.metrics).map(([k, v]) => (
                      <div key={k} className="bg-slate-800 rounded p-2">
                        <div className="text-slate-400 truncate">{k}</div>
                        <div className="font-mono font-bold">{v.toFixed(4)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Latent State μ_T</h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {["Stress", "Liquidity", "Growth"].map((label, i) => (
                      <div key={label} className="bg-slate-800 rounded p-2 text-center">
                        <div className="text-slate-400">{label}</div>
                        <div className="font-mono font-bold">
                          {macroState.mu_T[i]?.toFixed(3) ?? "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>

        {/* POLICY COMPARISON MODAL */}
        {showPolicyModal && policyResult && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl p-6 max-w-3xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-indigo-400">Policy Recommendation</h2>
                <button
                  onClick={() => setShowPolicyModal(false)}
                  className="text-slate-400 hover:text-slate-200 text-xl"
                >
                  ✕
                </button>
              </div>
              <PolicyComparisonTable
                result={policyResult}
                onSelect={(bps: number) => {
                  setParams(p => ({ ...p, delta_bps: bps }));
                  setShowPolicyModal(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
