import React, { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";

/* ── New layer components ───────────────────────────────────── */
import RawDataCharts from "../components/RawDataCharts";
import CoreCharts, { StepData, TimeseriesData } from "../components/CoreCharts";
import SimulationSidebar, {
  SimParams,
  AgentDef,
} from "../components/SimulationSidebar";

/* ── Existing components (reused) ───────────────────────────── */
import CorrelationHeatmap from "../components/CorrelationHeatmap";
import EigenSpectrum from "../components/EigenSpectrum";
import FedPolicyDashboard from "../components/FedPolicyDashboard";
import RLTrainingPanel from "../components/RLTrainingPanel";
import AgentComparison from "../components/AgentComparison";
import PolicyComparisonTable from "../components/PolicyComparisonTable";
import InfoTooltip from "../components/InfoTooltip";

/* ═══════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════ */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001";

const AGENTS: AgentDef[] = [
  { id: "custom", label: "Custom", icon: "🎛" },
  { id: "heuristic", label: "Heuristic", icon: "📐" },
  { id: "rl", label: "RL Agent", icon: "🧠" },
  { id: "historical", label: "Historical Fed", icon: "🏛" },
];

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

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

type AnalyticsTab = "structure" | "fed_policy" | "rl_training";

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */

export default function Home() {
  /* ── Core state ─────────────────────────────────────────── */
  const [macroState, setMacroState] = useState<MacroState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Timeseries (Layer 1 + 2 historical data) ──────────── */
  const [timeseries, setTimeseries] = useState<TimeseriesData | null>(null);

  /* ── Simulation ─────────────────────────────────────────── */
  const [isRunning, setIsRunning] = useState(false);
  const [simulationData, setSimulationData] = useState<StepData[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  /* ── Params ─────────────────────────────────────────────── */
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

  /* ── Date selection ─────────────────────────────────────── */
  const [historicalDates, setHistoricalDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [snapshotState, setSnapshotState] = useState<MacroState | null>(null);

  /* ── Agent comparison ───────────────────────────────────── */
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["custom", "heuristic"]);
  const [agentResults, setAgentResults] = useState<Record<string, any> | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);

  /* ── Policy ─────────────────────────────────────────────── */
  const [policyMode, setPolicyMode] = useState<"heuristic" | "rl">("heuristic");
  const [policyResult, setPolicyResult] = useState<PolicyComparison | null>(null);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);

  /* ── UI ─────────────────────────────────────────────────── */
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("structure");
  const [layer1Open, setLayer1Open] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* ── Derived ────────────────────────────────────────────── */
  const displayState: MacroState | null = snapshotState ?? macroState;

  const regimeColor =
    displayState?.regime_label === "Normal"
      ? "from-green-600 to-emerald-600"
      : displayState?.regime_label === "Fragile"
        ? "from-yellow-600 to-amber-600"
        : "from-red-600 to-rose-600";

  /* ═══════════════════════════════════════════════════════════
     Effects
     ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    refreshState();
  }, []);

  useEffect(() => {
    if (macroState) {
      fetchTimeseries();
      fetchHistoricalDates();
    }
  }, [macroState]);

  useEffect(() => {
    if (selectedDate) {
      fetchSnapshotState(selectedDate);
    } else {
      setSnapshotState(null);
    }
  }, [selectedDate]);

  /* ═══════════════════════════════════════════════════════════
     API Helpers
     ═══════════════════════════════════════════════════════════ */

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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeseries = async () => {
    try {
      const res = await fetch(`${API_URL}/api/historical/timeseries?years=15`);
      if (!res.ok) return;
      const data = await res.json();
      setTimeseries(data as TimeseriesData);
    } catch (e) {
      console.error("Failed to fetch timeseries:", e);
    }
  };

  const fetchHistoricalDates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/historical/dates`);
      if (!res.ok) return;
      const data = await res.json();
      setHistoricalDates(data.dates || []);
    } catch (e) {
      console.error("Failed to fetch dates:", e);
    }
  };

  const fetchSnapshotState = async (date: string) => {
    try {
      const res = await fetch(`${API_URL}/api/historical/state?date=${date}`);
      if (!res.ok) return;
      const data = await res.json();
      setSnapshotState({
        latest_date: data.date || data.latest_date || date,
        is_synthetic: false,
        mu_T: data.mu_T || [],
        P_T: data.P_T || [[]],
        stress_score: data.stress_score ?? 0,
        regime_label: data.regime_label || "Unknown",
        crisis_threshold: data.crisis_threshold ?? 0,
        inflation_gap: data.inflation_gap,
        fed_rate: data.fed_rate,
        metrics: data.metrics || {},
        correlation_matrix: data.correlation_matrix || [],
        correlation_labels: data.correlation_labels || [],
        eigenvalues: data.eigenvalues || [],
      });
    } catch (e) {
      console.error("Failed to fetch snapshot:", e);
    }
  };

  /* ── Simulation handlers ────────────────────────────────── */

  const handleRun = useCallback(() => {
    setSimulationData([]);
    setIsRunning(true);
    setError(null);
    const ws = new WebSocket(`${WS_URL}/ws/simulate`);
    wsRef.current = ws;
    ws.onopen = () => {
      const payload: any = {
        delta_bps: params.delta_bps,
        N: params.N,
        H: params.H,
        speed_ms: params.speed_ms,
        shocks: params.shocks,
        regime_switching: params.regime_switching,
      };
      if (selectedDate) {
        payload.start_date = selectedDate;
      }
      ws.send(JSON.stringify(payload));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) { setError(data.error); setIsRunning(false); return; }
      if (data.done && !data.step) { setIsRunning(false); return; }
      if (data.step) setSimulationData((prev) => [...prev, data as StepData]);
    };
    ws.onerror = () => { setIsRunning(false); setError("WebSocket connection failed"); };
    ws.onclose = () => { setIsRunning(false); wsRef.current = null; };
  }, [params, selectedDate]);

  const handlePause = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setIsRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    handlePause();
    setSimulationData([]);
    setPolicyResult(null);
    setShowPolicyModal(false);
    setAgentResults(null);
  }, [handlePause]);

  /* ── Policy recommendation ──────────────────────────────── */

  const handleRecommend = async () => {
    setRecommendLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/policy/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alpha: params.alpha, beta: params.beta,
          gamma: params.gamma, lambda: params.lambda,
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

  /* ── Agent comparison ───────────────────────────────────── */

  const handleAgentRun = async () => {
    setAgentRunning(true);
    setAgentResults(null);
    setError(null);
    try {
      const body: any = {
        agents: selectedAgents,
        custom_delta_bps: params.delta_bps,
        alpha: params.alpha,
        beta: params.beta,
        gamma: params.gamma,
        lambda: params.lambda,
        N: params.N,
        H: params.H,
        regime_switching: params.regime_switching,
        shocks: params.shocks,
      };
      if (selectedDate) body.start_date = selectedDate;
      const res = await fetch(`${API_URL}/api/agents/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Agent simulation failed");
      }
      const result = await res.json();
      setAgentResults(result.agents);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAgentRunning(false);
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

  const toggleAgent = (agent: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agent) ? prev.filter((a) => a !== agent) : [...prev, agent],
    );
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date || null);
    setSimulationData([]);
  };

  /* ── Analytics tab definitions ──────────────────────────── */

  const analyticsTabs: { key: AnalyticsTab; label: string; icon: string }[] = [
    { key: "structure", label: "Cross-Asset Structure", icon: "📊" },
    { key: "fed_policy", label: "Fed Policy Monitor", icon: "🏛" },
    { key: "rl_training", label: "RL Training Lab", icon: "🧠" },
  ];

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */

  return (
    <>
      <Head>
        <title>PolEn | Policy Engine Control Room</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* TOP BAR */}
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

          <div className="flex items-center gap-4 text-xs">
            {displayState && (
              <>
                <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                  <span className="text-slate-500">Date</span>
                  <span className="font-mono text-slate-300">{displayState.latest_date}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                  <span className="text-slate-500">Regime</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r ${regimeColor} text-white`}>
                    {displayState.regime_label}
                  </span>
                </div>
                {displayState.inflation_gap !== undefined && (
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                    <span className="text-slate-500">Infl&nbsp;Gap</span>
                    <span className={`font-mono font-bold ${
                      Math.abs(displayState.inflation_gap) > 0.02 ? "text-red-400" :
                      Math.abs(displayState.inflation_gap) > 0.01 ? "text-yellow-400" : "text-green-400"
                    }`}>
                      {(displayState.inflation_gap * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
                {displayState.fed_rate !== undefined && (
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30">
                    <span className="text-slate-500">Fed</span>
                    <span className="font-mono text-slate-300">{(displayState.fed_rate * 100).toFixed(2)}%</span>
                  </div>
                )}
              </>
            )}
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/30 text-slate-400 hover:text-slate-200 transition-colors">
              {sidebarOpen ? "◀ Hide Sim" : "▶ Show Sim"}
            </button>
            <button onClick={refreshState} disabled={loading}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 px-4 py-1.5 rounded-lg text-white text-xs font-medium transition-all shadow-md shadow-indigo-900/20">
              {loading ? "↻ Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </header>

        {/* ERROR BANNER */}
        {error && (
          <div className="bg-red-900/40 border-b border-red-800/50 px-6 py-2 text-red-200 text-sm flex items-center justify-between backdrop-blur-sm flex-shrink-0">
            <span className="flex items-center gap-2"><span className="text-red-400">⚠</span> {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 transition-colors">✕</button>
          </div>
        )}

        {/* MAIN LAYOUT: Scrollable Center + Fixed Right Sidebar */}
        <div className="flex flex-1 min-h-0">

          {/* SCROLLABLE CENTER */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4 scrollbar-thin">

            {!macroState && !loading && (
              <div className="flex items-center justify-center h-96 text-slate-400">
                <div className="text-center space-y-3">
                  <div className="text-5xl opacity-30">🌐</div>
                  <p className="text-xl font-semibold text-slate-300">No state loaded</p>
                  <p className="text-sm">Click <span className="text-indigo-400 font-medium">&ldquo;Refresh&rdquo;</span> to load data.</p>
                </div>
              </div>
            )}
            {loading && (
              <div className="flex items-center justify-center h-96 text-slate-400">
                <div className="text-center space-y-3">
                  <div className="animate-spin text-4xl">⚙</div>
                  <p className="text-sm">Loading data, running pipeline &amp; Kalman filter...</p>
                </div>
              </div>
            )}

            {macroState && !loading && (
              <>
                {/* LAYER 1: Raw Cross-Asset Data */}
                <section>
                  <button
                    onClick={() => setLayer1Open(!layer1Open)}
                    className="flex items-center gap-2 mb-2 group"
                  >
                    <span className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                      {layer1Open ? "▼" : "▶"}
                    </span>
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Layer 1 — Cross-Asset Historical Data
                    </h2>
                    <InfoTooltip text="Raw FRED time-series: SPX returns, yields, VIX, credit spreads, yield curve slope, inflation, fed funds rate. Click any chart to select a date." />
                  </button>
                  {layer1Open && timeseries && (
                    <RawDataCharts
                      dates={timeseries.dates}
                      series={timeseries.series}
                      selectedDate={selectedDate}
                      onDateClick={handleDateChange}
                    />
                  )}
                </section>

                {/* LAYER 2: Core Analytics (the 4 charts) */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Layer 2 — Core Analytics
                    </h2>
                    <InfoTooltip text="Stress Factor, Growth Factor, Crisis Probability, and Expected Shortfall. Historical Kalman estimates overlaid with Monte Carlo simulation fan-charts." />
                    {isRunning && (
                      <span className="flex items-center gap-1.5 text-[10px] text-indigo-400 font-medium">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        Simulating...
                      </span>
                    )}
                    {simulationData.length > 0 && !isRunning && (
                      <span className="text-[10px] text-slate-500">
                        {simulationData.length} / {params.H} steps
                      </span>
                    )}
                  </div>
                  <CoreCharts
                    timeseries={timeseries}
                    simulationData={simulationData}
                    selectedDate={selectedDate}
                    isRunning={isRunning}
                    historyMonths={120}
                  />
                </section>

                {/* LAYER 2B: Tabbed Analytics Panels */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Layer 2 — Analysis Panels
                    </h2>
                  </div>

                  <div className="flex items-center gap-1 mb-3">
                    {analyticsTabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setAnalyticsTab(tab.key)}
                        className={`px-4 py-2 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
                          analyticsTab === tab.key
                            ? "bg-slate-800 text-indigo-300 ring-1 ring-indigo-500/30"
                            : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                        }`}
                      >
                        <span>{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                    <span className="ml-auto text-[9px] text-slate-600 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedDate ? "bg-cyan-500" : "bg-purple-500"}`} />
                      {selectedDate ? `Snapshot: ${selectedDate}` : "Latest state"}
                    </span>
                  </div>

                  <div className="min-h-[320px]">
                    {analyticsTab === "structure" && displayState && (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correlation Matrix</h4>
                            <InfoTooltip text="Cross-asset correlation matrix computed from rolling window of monthly returns." />
                          </div>
                          <CorrelationHeatmap
                            matrix={displayState.correlation_matrix}
                            labels={displayState.correlation_labels}
                          />
                        </div>

                        <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Eigenvalue Spectrum</h4>
                            <InfoTooltip text="PCA eigenvalues showing variance explained by each principal component." />
                          </div>
                          <EigenSpectrum
                            eigenvalues={displayState.eigenvalues}
                            labels={displayState.correlation_labels}
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Latent State μ_T</h4>
                              <InfoTooltip text="Kalman-filtered latent state vector: Stress, Liquidity, Growth dimensions." />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {["Stress", "Liquidity", "Growth"].map((label, i) => {
                                const val = displayState.mu_T[i];
                                const color = i === 0 ? "text-red-400" : i === 1 ? "text-blue-400" : "text-green-400";
                                return (
                                  <div key={label} className="bg-slate-900/60 rounded-lg p-2 text-center">
                                    <div className={`text-[10px] ${color} font-medium`}>{label}</div>
                                    <div className="font-mono font-bold text-sm">{val?.toFixed(3) ?? "—"}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Key Metrics</h4>
                              <InfoTooltip text="Real-time macro metrics from the data pipeline and Kalman filter." />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[11px] max-h-[160px] overflow-y-auto">
                              {Object.entries(displayState.metrics).map(([k, v]) => (
                                <div key={k} className="bg-slate-900/60 rounded px-2 py-1.5 flex justify-between">
                                  <span className="text-slate-500 truncate mr-2">{k}</span>
                                  <span className="font-mono font-bold text-slate-300">
                                    {typeof v === "number" ? v.toFixed(4) : String(v)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {analyticsTab === "structure" && !displayState && (
                      <div className="flex items-center justify-center h-72 text-slate-500 text-sm">
                        Load data to view cross-asset structure analysis
                      </div>
                    )}

                    {analyticsTab === "fed_policy" && displayState && (
                      <FedPolicyDashboard
                        inflationGap={displayState.inflation_gap ?? 0}
                        fedRate={displayState.fed_rate ?? 0}
                        stressScore={displayState.stress_score}
                        regimeLabel={displayState.regime_label}
                        crisisThreshold={displayState.crisis_threshold}
                        mu_T={displayState.mu_T}
                      />
                    )}
                    {analyticsTab === "fed_policy" && !displayState && (
                      <div className="flex items-center justify-center h-72 text-slate-500 text-sm">
                        Load data to view Fed policy analysis
                      </div>
                    )}

                    {analyticsTab === "rl_training" && <RLTrainingPanel />}
                  </div>
                </section>

                {/* LAYER 3: Agent Comparison Results */}
                {agentResults && (
                  <section>
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Layer 3 — Policy Agent Comparison
                      </h2>
                      <InfoTooltip text="Side-by-side comparison of different policy agents: stress paths, crisis probability, growth trajectories, and aggregate loss." />
                    </div>
                    <AgentComparison results={agentResults} horizon={params.H} />
                  </section>
                )}
              </>
            )}
          </div>

          {/* RIGHT SIDEBAR: Simulation Controls */}
          {sidebarOpen && (
            <aside className="w-72 flex-shrink-0 bg-slate-900/80 border-l border-slate-700/30 overflow-y-auto p-3 scrollbar-thin">
              <SimulationSidebar
                availableDates={historicalDates}
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                params={params}
                setParams={setParams}
                agents={AGENTS}
                selectedAgents={selectedAgents}
                onToggleAgent={toggleAgent}
                policyMode={policyMode}
                onPolicyModeChange={handlePolicyModeChange}
                onRun={handleRun}
                onPause={handlePause}
                onReset={handleReset}
                onAgentRun={handleAgentRun}
                onRecommend={handleRecommend}
                isRunning={isRunning}
                agentRunning={agentRunning}
                recommendLoading={recommendLoading}
                snapshotRegime={displayState?.regime_label}
                snapshotStress={displayState?.stress_score}
              />
            </aside>
          )}
        </div>

        {/* POLICY COMPARISON MODAL */}
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
                  ✕
                </button>
              </div>
              <PolicyComparisonTable
                result={policyResult}
                onSelect={(bps: number) => { setParams((p) => ({ ...p, delta_bps: bps })); setShowPolicyModal(false); }}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
