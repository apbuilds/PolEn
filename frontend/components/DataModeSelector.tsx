import React from "react";

interface DataModeSelectorProps {
  mode: "historical" | "simulation";
  onModeChange: (mode: "historical" | "simulation") => void;
}

/**
 * Top-level toggle between Historical browsing and Simulation modes.
 *
 * Historical mode lets the user scrub through time and see all indicators
 * update at each monthly snapshot.
 *
 * Simulation mode lets the user run forward Monte-Carlo projections from
 * a chosen starting state with one or more policy agents.
 */
export default function DataModeSelector({
  mode,
  onModeChange,
}: DataModeSelectorProps) {
  return (
    <div className="flex w-full rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900/60 mb-4">
      <button
        onClick={() => onModeChange("historical")}
        className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-all
          flex items-center justify-center gap-1.5 ${
            mode === "historical"
              ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-900/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
      >
        📜 Historical
      </button>
      <button
        onClick={() => onModeChange("simulation")}
        className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition-all
          flex items-center justify-center gap-1.5 ${
            mode === "simulation"
              ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          }`}
      >
        🔬 Simulation
      </button>
    </div>
  );
}
