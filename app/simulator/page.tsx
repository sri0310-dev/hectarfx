"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
} from "recharts";

type Trade = {
  tradeId: string;
  commodity: string;
  usdInvoice: number;
  inrSale: number;
  inrSaleDate: string;
  mtbFx: number;
};

type FxData = {
  spot: number;
  fwd1m: number;
  fwd2m: number;
  fwd3m: number;
};

type HedgeLeg = {
  id: string;
  date: string;
  settlementDate: string;
  notionalUsd: number;
  type: string;
  rate: number;
  status: string;
};

type SimResult = {
  scenario: string;
  finalSpot: number;
  exposureUsd: number;
  mtbBlended: number;
  hedgeLegs: HedgeLeg[];
  hedgedPct: number;
  hedgePnlInr: number;
  hedgePnlUsd: number;
  unhedgedImpactInr: number;
  netPnlInr: number;
  netPnlUsd: number;
  effectiveRate: number;
};

type Suggestion = {
  strategy: string;
  label: string;
  rationale: string;
  expectedSavingInr: number;
  riskLevel: string;
  confidence: number;
};

type StrategyConfig = {
  name: string;
  label: string;
  description: string;
  layers?: { pct: number; triggerSpot: number; action: "HEDGE_SELL_USD" }[];
  tenorDays?: number;
  bandWidth?: number;
  lowerStrike?: number;
  upperStrike?: number;
};

function formatINR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const STRATEGY_PRESETS: StrategyConfig[] = [
  {
    name: "NO_HEDGE",
    label: "No Hedge (Baseline)",
    description: "Fully unhedged. All exposure is at spot on settlement date.",
  },
  {
    name: "FULL_HEDGE_NOW",
    label: "Full Hedge Now",
    description: "Sell 100% of USD exposure forward immediately at current rates.",
    tenorDays: 60,
  },
  {
    name: "LAYERED_FORWARDS",
    label: "Layered Forwards (50/30/20)",
    description: "Progressive hedging at trigger levels. 50% first tranche, 30% second, 20% final.",
    tenorDays: 60,
    layers: [
      { pct: 0.50, triggerSpot: 86.40, action: "HEDGE_SELL_USD" },
      { pct: 0.30, triggerSpot: 86.70, action: "HEDGE_SELL_USD" },
      { pct: 0.20, triggerSpot: 87.00, action: "HEDGE_SELL_USD" },
    ],
  },
  {
    name: "DYNAMIC_BANDS",
    label: "Dynamic Band Hedging",
    description: "Automatic hedging when spot moves beyond ±0.50 bands from current level.",
    bandWidth: 0.50,
  },
  {
    name: "RANGE_FORWARD",
    label: "Range Forward (Collar)",
    description: "Zero-cost collar. Floor and cap define the range. No premium but capped upside.",
    lowerStrike: 85.50,
    upperStrike: 87.00,
  },
];

const SCENARIO_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6"];

export default function SimulatorPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [fx, setFx] = useState<FxData | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState(0);
  const [strategies, setStrategies] = useState<StrategyConfig[]>(STRATEGY_PRESETS);
  const [results, setResults] = useState<SimResult[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [running, setRunning] = useState(false);
  const [showBlotter, setShowBlotter] = useState(false);
  const [spotOverride, setSpotOverride] = useState("");
  const [scenarioRange, setScenarioRange] = useState("1.50");

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
    ]).then(([td, fd]) => {
      setTrades(td.trades || []);
      setFx(fd.fx);
      setSpotOverride(String(fd.fx?.spot || 86.20));

      // Update trigger levels based on current spot
      if (fd.fx) {
        const s = fd.fx.spot;
        setStrategies((prev) =>
          prev.map((st) => {
            if (st.name === "LAYERED_FORWARDS") {
              return {
                ...st,
                layers: [
                  { pct: 0.50, triggerSpot: Number((s + 0.20).toFixed(2)), action: "HEDGE_SELL_USD" as const },
                  { pct: 0.30, triggerSpot: Number((s + 0.50).toFixed(2)), action: "HEDGE_SELL_USD" as const },
                  { pct: 0.20, triggerSpot: Number((s + 0.80).toFixed(2)), action: "HEDGE_SELL_USD" as const },
                ],
              };
            }
            if (st.name === "RANGE_FORWARD") {
              return {
                ...st,
                lowerStrike: Number((s - 0.75).toFixed(2)),
                upperStrike: Number((s + 0.75).toFixed(2)),
              };
            }
            return st;
          })
        );

        // Fetch suggestions
        if (td.trades?.length) {
          fetch("/api/suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trades: td.trades, fx: fd.fx }),
          })
            .then((r) => r.json())
            .then((d) => setSuggestions(d.suggestions || []));
        }
      }
    });
  }, []);

  async function runSimulation() {
    if (!fx || trades.length === 0) return;
    setRunning(true);

    const spot = Number(spotOverride) || fx.spot;
    const range = Number(scenarioRange) || 1.50;
    const strat = strategies[selectedStrategy];
    const today = new Date().toISOString().slice(0, 10);

    // Generate intermediate path points for layered triggers
    const endDate = "2026-06-30";
    function makePath(endSpot: number) {
      const steps = 10;
      const drift = (endSpot - spot) / steps;
      const path = [];
      for (let i = 0; i <= steps; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + Math.round((i / steps) * 150));
        path.push({
          date: d.toISOString().slice(0, 10),
          spot: Number((spot + drift * i).toFixed(4)),
        });
      }
      return path;
    }

    const payload = {
      fx: { ...fx, spot },
      trades,
      strategy: strat,
      scenarios: [
        { name: "Base (Flat)", path: makePath(spot) },
        { name: `INR Strengthens (−₹${(range / 2).toFixed(2)})`, path: makePath(spot - range / 2) },
        { name: `INR Weakens (+₹${(range / 2).toFixed(2)})`, path: makePath(spot + range / 2) },
        { name: `Sharp Depreciation (+₹${range.toFixed(2)})`, path: makePath(spot + range) },
        { name: `Sharp Appreciation (−₹${range.toFixed(2)})`, path: makePath(spot - range) },
      ],
    };

    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setResults(data.results || []);
    setRunning(false);
  }

  if (!fx) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading simulator...</div>
      </div>
    );
  }

  const strat = strategies[selectedStrategy];

  // Comparison bar chart data
  const comparisonData = results?.map((r) => ({
    scenario: r.scenario.replace(/[()]/g, "").slice(0, 25),
    netPnlInr: r.netPnlInr,
    hedgePnlInr: r.hedgePnlInr,
    unhedgedImpact: r.unhedgedImpactInr,
    effectiveRate: r.effectiveRate,
    hedgedPct: Math.round(r.hedgedPct * 100),
  }));

  // Effective rate comparison
  const rateData = results?.map((r) => ({
    scenario: r.scenario.replace(/[()]/g, "").slice(0, 25),
    effectiveRate: r.effectiveRate,
    mtbRate: r.mtbBlended,
    spotAtEnd: r.finalSpot,
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Hedge Simulator</h1>
        <p className="text-sm text-slate-400 mt-1">
          {trades.length} trades &middot; {formatUSD(trades.reduce((s, t) => s + t.usdInvoice, 0))} total exposure
        </p>
      </div>

      {/* Strategy Suggestions Banner */}
      {suggestions.length > 0 && (
        <div className="card bg-blue-600/5 border-blue-500/20">
          <h3 className="text-sm font-semibold text-blue-400 mb-2">
            Recommended Strategy
          </h3>
          <div className="flex items-start justify-between">
            <div>
              <span className="font-medium text-slate-200">
                {suggestions[0].label}
              </span>
              <span className={`ml-2 badge ${
                suggestions[0].riskLevel === "LOW" ? "badge-green" :
                suggestions[0].riskLevel === "MEDIUM" ? "badge-amber" : "badge-red"
              }`}>
                {suggestions[0].riskLevel}
              </span>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                {suggestions[0].rationale}
              </p>
            </div>
            <button
              onClick={() => {
                const idx = strategies.findIndex(
                  (s) => s.name === suggestions[0].strategy
                );
                if (idx >= 0) setSelectedStrategy(idx);
              }}
              className="btn-secondary text-xs flex-shrink-0"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {/* Strategy selector */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">
          Select Strategy
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {strategies.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setSelectedStrategy(i)}
              className={`p-3 rounded-lg border text-left transition-all ${
                selectedStrategy === i
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-[#2a3650] hover:border-slate-500 bg-[#111827]"
              }`}
            >
              <div className="text-sm font-medium text-slate-200">
                {s.label}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {s.description.slice(0, 60)}...
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Strategy config + run controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card col-span-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            Strategy Configuration: {strat.label}
          </h3>
          <p className="text-xs text-slate-400 mb-4">{strat.description}</p>

          {strat.name === "LAYERED_FORWARDS" && strat.layers && (
            <div className="space-y-2">
              {strat.layers.map((layer, li) => (
                <div key={li} className="flex items-center gap-4 p-3 bg-[#111827] rounded-lg">
                  <span className="text-xs text-slate-400 w-16">
                    Layer {li + 1}
                  </span>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500">% of Exposure</label>
                    <input
                      className="input-field text-sm"
                      type="number"
                      value={Math.round(layer.pct * 100)}
                      onChange={(e) => {
                        const newLayers = [...strat.layers!];
                        newLayers[li] = { ...newLayers[li], pct: Number(e.target.value) / 100 };
                        setStrategies((prev) =>
                          prev.map((s, si) => (si === selectedStrategy ? { ...s, layers: newLayers } : s))
                        );
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-500">Trigger Spot</label>
                    <input
                      className="input-field text-sm"
                      type="number"
                      step="0.01"
                      value={layer.triggerSpot}
                      onChange={(e) => {
                        const newLayers = [...strat.layers!];
                        newLayers[li] = { ...newLayers[li], triggerSpot: Number(e.target.value) };
                        setStrategies((prev) =>
                          prev.map((s, si) => (si === selectedStrategy ? { ...s, layers: newLayers } : s))
                        );
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {strat.name === "DYNAMIC_BANDS" && (
            <div className="flex gap-4">
              <div>
                <label className="text-[10px] text-slate-500">Band Width (INR)</label>
                <input
                  className="input-field text-sm w-32"
                  type="number"
                  step="0.10"
                  value={strat.bandWidth || 0.50}
                  onChange={(e) => {
                    setStrategies((prev) =>
                      prev.map((s, si) =>
                        si === selectedStrategy ? { ...s, bandWidth: Number(e.target.value) } : s
                      )
                    );
                  }}
                />
              </div>
            </div>
          )}

          {strat.name === "RANGE_FORWARD" && (
            <div className="flex gap-4">
              <div>
                <label className="text-[10px] text-slate-500">Floor (Lower Strike)</label>
                <input
                  className="input-field text-sm w-40"
                  type="number"
                  step="0.01"
                  value={strat.lowerStrike || 85.50}
                  onChange={(e) => {
                    setStrategies((prev) =>
                      prev.map((s, si) =>
                        si === selectedStrategy ? { ...s, lowerStrike: Number(e.target.value) } : s
                      )
                    );
                  }}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500">Cap (Upper Strike)</label>
                <input
                  className="input-field text-sm w-40"
                  type="number"
                  step="0.01"
                  value={strat.upperStrike || 87.00}
                  onChange={(e) => {
                    setStrategies((prev) =>
                      prev.map((s, si) =>
                        si === selectedStrategy ? { ...s, upperStrike: Number(e.target.value) } : s
                      )
                    );
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-slate-300">
            Scenario Parameters
          </h3>
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Starting Spot
            </label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              value={spotOverride}
              onChange={(e) => setSpotOverride(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Scenario Range (±INR)
            </label>
            <input
              className="input-field"
              type="number"
              step="0.25"
              value={scenarioRange}
              onChange={(e) => setScenarioRange(e.target.value)}
            />
          </div>
          <button
            onClick={runSimulation}
            disabled={running || trades.length === 0}
            className="btn-success w-full text-center"
          >
            {running ? "Running..." : "Run Simulation"}
          </button>
        </div>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <>
          {/* Net P&L comparison chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">
              Net P&L by Scenario (INR)
            </h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={comparisonData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
                <XAxis
                  type="number"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={{ stroke: "#2a3650" }}
                  tickFormatter={(v) => {
                    if (Math.abs(v) >= 1e5) return `${(v / 1e5).toFixed(0)}L`;
                    return v;
                  }}
                />
                <YAxis
                  dataKey="scenario"
                  type="category"
                  width={180}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  axisLine={{ stroke: "#2a3650" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a2234",
                    border: "1px solid #2a3650",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                  formatter={(value: number, name: string) => [
                    formatINR(value),
                    name === "hedgePnlInr" ? "Hedge P&L" : name === "unhedgedImpact" ? "Unhedged Impact" : "Net P&L",
                  ]}
                />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 11 }} />
                <ReferenceLine x={0} stroke="#64748b" />
                <Bar dataKey="hedgePnlInr" name="Hedge P&L" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="unhedgedImpact" name="Unhedged Impact" stackId="a" fill="#64748b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Effective rate chart */}
          <div className="card">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">
              Effective Rate vs Book Rate
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
                <XAxis
                  dataKey="scenario"
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  axisLine={{ stroke: "#2a3650" }}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={{ stroke: "#2a3650" }}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a2234",
                    border: "1px solid #2a3650",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                  formatter={(value: number, name: string) => [
                    value.toFixed(4),
                    name === "effectiveRate" ? "Effective Rate" : name === "mtbRate" ? "Book Rate" : "Spot at End",
                  ]}
                />
                <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 11 }} />
                <Bar dataKey="effectiveRate" name="Effective Rate" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="mtbRate" name="Book Rate" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spotAtEnd" name="Spot at End" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Results table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a3650] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">
                Simulation Results — {strat.label}
              </h3>
              <button
                onClick={() => setShowBlotter(!showBlotter)}
                className="btn-secondary text-xs"
              >
                {showBlotter ? "Hide Blotter" : "Show Hedge Blotter"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3650]">
                    <th className="table-header">Scenario</th>
                    <th className="table-header">Final Spot</th>
                    <th className="table-header">Hedged %</th>
                    <th className="table-header">Effective Rate</th>
                    <th className="table-header">Hedge P&L (INR)</th>
                    <th className="table-header">Unhedged Impact</th>
                    <th className="table-header">Net P&L (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3650]/50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-[#1e2a3f]">
                      <td className="table-cell text-slate-200 font-medium text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }}
                          />
                          {r.scenario}
                        </div>
                      </td>
                      <td className="table-cell font-mono text-slate-300">
                        {r.finalSpot.toFixed(4)}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#111827] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(r.hedgedPct * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">
                            {Math.round(r.hedgedPct * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="table-cell font-mono text-cyan-400">
                        {r.effectiveRate.toFixed(4)}
                      </td>
                      <td className={`table-cell font-mono ${r.hedgePnlInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatINR(r.hedgePnlInr)}
                      </td>
                      <td className={`table-cell font-mono ${r.unhedgedImpactInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatINR(r.unhedgedImpactInr)}
                      </td>
                      <td className={`table-cell font-mono font-bold ${r.netPnlInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatINR(r.netPnlInr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hedge blotter */}
          {showBlotter && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#2a3650]">
                <h3 className="text-sm font-semibold text-slate-300">
                  Hedge Blotter (All Scenarios)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#2a3650]">
                      <th className="table-header">Scenario</th>
                      <th className="table-header">Hedge ID</th>
                      <th className="table-header">Exec Date</th>
                      <th className="table-header">Settlement</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Notional USD</th>
                      <th className="table-header">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a3650]/50">
                    {results.flatMap((r) =>
                      r.hedgeLegs.map((leg) => (
                        <tr key={`${r.scenario}-${leg.id}`} className="hover:bg-[#1e2a3f]">
                          <td className="table-cell text-xs text-slate-400">
                            {r.scenario.slice(0, 25)}
                          </td>
                          <td className="table-cell font-mono text-blue-400 text-xs">
                            {leg.id}
                          </td>
                          <td className="table-cell text-slate-300 text-xs">
                            {leg.date}
                          </td>
                          <td className="table-cell text-slate-300 text-xs">
                            {leg.settlementDate}
                          </td>
                          <td className="table-cell">
                            <span className={leg.type === "FWD_SELL_USD" ? "badge-green" : "badge-amber"}>
                              {leg.type.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="table-cell font-mono text-slate-200">
                            {formatUSD(leg.notionalUsd)}
                          </td>
                          <td className="table-cell font-mono text-amber-400">
                            {leg.rate.toFixed(4)}
                          </td>
                        </tr>
                      ))
                    )}
                    {results.every((r) => r.hedgeLegs.length === 0) && (
                      <tr>
                        <td colSpan={7} className="table-cell text-center text-slate-500 py-8">
                          No hedge legs executed in any scenario (unhedged strategy).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
