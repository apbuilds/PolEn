import React from "react";
import { PolicyComparison } from "../pages/index";

interface PolicyComparisonTableProps {
  result: PolicyComparison;
  onSelect: (bps: number) => void;
}

export default function PolicyComparisonTable({
  result,
  onSelect,
}: PolicyComparisonTableProps) {
  return (
    <div>
      {/* Recommendation Banner */}
      <div className="bg-emerald-900/40 border border-emerald-700 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <div className="text-lg font-bold text-emerald-300">
              Recommended: {result.recommended_action} ({result.recommended_bps > 0 ? "+" : ""}
              {result.recommended_bps} bps)
            </div>
            <div className="text-sm text-slate-300 mt-1">{result.explanation}</div>
          </div>
        </div>
      </div>

      {/* Weights display */}
      <div className="flex gap-4 mb-3 text-xs text-slate-400">
        <span>
          α={result.weights.alpha.toFixed(1)} β={result.weights.beta.toFixed(1)} γ=
          {result.weights.gamma.toFixed(1)} λ={result.weights.lambda.toFixed(1)}
        </span>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-700">
              <th className="text-left py-2 px-3">Action</th>
              <th className="text-right py-2 px-3">Δbps</th>
              <th className="text-right py-2 px-3">Avg Stress</th>
              <th className="text-right py-2 px-3">Growth↓</th>
              <th className="text-right py-2 px-3">ES95</th>
              <th className="text-right py-2 px-3">Crisis End%</th>
              <th className="text-right py-2 px-3 font-bold">Total Loss</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {result.comparison.map((row) => {
              const isRecommended = row.action === result.recommended_action;
              return (
                <tr
                  key={row.action}
                  className={`border-b border-slate-800 transition-colors ${
                    isRecommended
                      ? "bg-emerald-900/20 hover:bg-emerald-900/30"
                      : "hover:bg-slate-800/50"
                  }`}
                >
                  <td className="py-2.5 px-3 font-medium">
                    {isRecommended && <span className="text-emerald-400 mr-1">✓</span>}
                    {row.action}
                  </td>
                  <td className="text-right py-2.5 px-3 font-mono">
                    {row.delta_bps > 0 ? "+" : ""}
                    {row.delta_bps}
                  </td>
                  <td className="text-right py-2.5 px-3 font-mono text-red-400">
                    {row.mean_stress.toFixed(4)}
                  </td>
                  <td className="text-right py-2.5 px-3 font-mono text-green-400">
                    {row.mean_growth_penalty.toFixed(4)}
                  </td>
                  <td className="text-right py-2.5 px-3 font-mono text-amber-400">
                    {row.mean_es95.toFixed(4)}
                  </td>
                  <td className="text-right py-2.5 px-3 font-mono">
                    {(row.crisis_end * 100).toFixed(1)}%
                  </td>
                  <td
                    className={`text-right py-2.5 px-3 font-mono font-bold ${
                      isRecommended ? "text-emerald-400" : "text-slate-200"
                    }`}
                  >
                    {row.total_loss.toFixed(4)}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => onSelect(row.delta_bps)}
                      className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded transition-colors"
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
