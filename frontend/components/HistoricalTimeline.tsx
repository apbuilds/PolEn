import React, { useState, useEffect, useMemo, useCallback } from "react";

interface HistoricalTimelineProps {
  /** Sorted array of available date strings ("YYYY-MM-DD"). */
  dates: string[];
  /** Currently selected date, or null if none selected. */
  selectedDate: string | null;
  /** Callback when the user selects a new date. */
  onDateChange: (date: string) => void;
  /** Regime label at the selected date (colours the badge). */
  regimeAtDate?: string;
}

/**
 * Interactive timeline slider for the Historical data-browsing mode.
 *
 * Features:
 *  - Range slider spanning all available monthly dates
 *  - Step-forward / step-back buttons
 *  - Play / Pause with configurable speed
 *  - Colour-coded regime badge for the selected date
 */
export default function HistoricalTimeline({
  dates,
  selectedDate,
  onDateChange,
  regimeAtDate,
}: HistoricalTimelineProps) {
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(500);

  const currentIndex = useMemo(
    () =>
      selectedDate ? dates.indexOf(selectedDate) : dates.length - 1,
    [selectedDate, dates],
  );

  // Auto-advance through time when playing
  useEffect(() => {
    if (!playing || currentIndex < 0 || currentIndex >= dates.length - 1) {
      if (playing && currentIndex >= dates.length - 1) setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      onDateChange(dates[currentIndex + 1]);
    }, playSpeed);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, dates, playSpeed, onDateChange]);

  // Stabilise callbacks for step buttons
  const stepBack = useCallback(() => {
    if (currentIndex > 0) onDateChange(dates[currentIndex - 1]);
  }, [currentIndex, dates, onDateChange]);

  const stepForward = useCallback(() => {
    if (currentIndex < dates.length - 1) onDateChange(dates[currentIndex + 1]);
  }, [currentIndex, dates, onDateChange]);

  if (dates.length === 0) {
    return (
      <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-4 text-center text-slate-500 text-sm">
        No historical dates available. Refresh data first.
      </div>
    );
  }

  const regimeColor =
    regimeAtDate === "Normal"
      ? "text-green-400"
      : regimeAtDate === "Fragile"
        ? "text-yellow-400"
        : regimeAtDate === "Crisis"
          ? "text-red-400"
          : "text-slate-400";

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/30 p-4 space-y-3">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Timeline
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-cyan-400">
            {selectedDate || "—"}
          </span>
          {regimeAtDate && (
            <span className={`text-[10px] font-bold ${regimeColor}`}>
              {regimeAtDate}
            </span>
          )}
        </div>
      </div>

      {/* ── Controls ────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Step backward */}
        <button
          className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-xs
            disabled:opacity-30 transition-colors"
          onClick={stepBack}
          disabled={currentIndex <= 0}
          title="Previous month"
        >
          ◀
        </button>

        {/* Play / Pause */}
        <button
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            playing
              ? "bg-amber-600/60 hover:bg-amber-500/60 text-amber-200"
              : "bg-slate-700/60 hover:bg-slate-600/60"
          }`}
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pause" : "Play through time"}
        >
          {playing ? "⏸" : "▶"}
        </button>

        {/* Slider */}
        <input
          type="range"
          min={0}
          max={dates.length - 1}
          value={currentIndex >= 0 ? currentIndex : 0}
          onChange={(e) => onDateChange(dates[parseInt(e.target.value)])}
          className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
        />

        {/* Step forward */}
        <button
          className="p-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-xs
            disabled:opacity-30 transition-colors"
          onClick={stepForward}
          disabled={currentIndex >= dates.length - 1}
          title="Next month"
        >
          ▶
        </button>

        {/* Speed control */}
        <select
          value={playSpeed}
          onChange={(e) => setPlaySpeed(parseInt(e.target.value))}
          className="bg-slate-700/60 text-[10px] rounded-lg p-1.5 text-slate-300
            border border-slate-600/30"
        >
          <option value={1000}>1×</option>
          <option value={500}>2×</option>
          <option value={200}>5×</option>
          <option value={100}>10×</option>
        </select>
      </div>

      {/* ── Range labels ────────────────────────────────── */}
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{dates[0]}</span>
        <span className="text-slate-500">
          {currentIndex + 1} / {dates.length}
        </span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}
