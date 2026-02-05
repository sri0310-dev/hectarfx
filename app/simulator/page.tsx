"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

type Trade = {
  tradeId: string;
  commodity: string;
  usdInvoice: number;
  inrSale: number;
  inrSaleDate: string;
  mtbFx: number;
  mtmFx?: number;
  mtbInr: number;
  mtmInr: number;
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

export default function SimulatorPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [liveSpot, setLiveSpot] = useState(0);
  const [scenarioSpot, setScenarioSpot] = useState("");
  const [loading, setLoading] = useState(true);

  // Hedge inputs
  const [hedgeAmountInr, setHedgeAmountInr] = useState("40000000"); // 4 Cr default
  const [hedgeRate, setHedgeRate] = useState("90.60");

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
    ]).then(([td, fd]) => {
      setTrades(td.trades || []);
      const spot = fd.fx?.spot || 90.29;
      setLiveSpot(spot);
      setScenarioSpot(spot.toFixed(4));
      setLoading(false);
    });

    // Auto-refresh spot every 60s
    const interval = setInterval(() => {
      fetch("/api/fx")
        .then((r) => r.json())
        .then((d) => {
          if (d.fx?.spot) setLiveSpot(d.fx.spot);
        });
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Computed values — react instantly to any input change
  const analysis = useMemo(() => {
    if (trades.length === 0) return null;

    const scSpot = Number(scenarioSpot) || liveSpot;
    const hAmountInr = Number(hedgeAmountInr) || 0;
    const hRate = Number(hedgeRate) || 0;

    // Total exposure
    const totalUsd = trades.reduce((s, t) => s + t.usdInvoice, 0);
    const totalInr = trades.reduce((s, t) => s + t.inrSale, 0);
    const totalMtb = trades.reduce((s, t) => s + t.mtbInr, 0);
    const totalMtm = trades.reduce((s, t) => s + t.mtmInr, 0);

    // Blended MTB rate
    const blendedMtb = totalUsd > 0
      ? trades.reduce((s, t) => s + t.mtbFx * t.usdInvoice, 0) / totalUsd
      : 0;

    // Hedge analysis
    const hedgeUsd = hRate > 0 ? hAmountInr / hRate : 0;
    const hedgedPct = totalUsd > 0 ? Math.min(hedgeUsd / totalUsd, 1) : 0;
    const unhedgedUsd = Math.max(totalUsd - hedgeUsd, 0);
    const unhedgedInr = unhedgedUsd * scSpot;

    // Hedge P&L: difference between hedge rate and scenario spot, on hedged notional
    // If you sold USD forward at hedgeRate and spot goes to scenarioSpot:
    // P&L per USD = hedgeRate - scenarioSpot (positive = you gained by hedging)
    const hedgePnlPerUsd = hRate - scSpot;
    const hedgePnlInr = hedgePnlPerUsd * hedgeUsd;
    const hedgePnlUsd = scSpot > 0 ? hedgePnlInr / scSpot : 0;

    // Unhedged exposure impact vs MTB
    // If spot moves to scenario, the unhedged portion settles at scenario rate
    // Impact = (blendedMtb - scenarioSpot) * unhedgedUsd (+ means MTB was higher = loss)
    const unhedgedImpactPerUsd = blendedMtb - scSpot;
    const unhedgedImpactInr = unhedgedImpactPerUsd * unhedgedUsd;
    const unhedgedImpactUsd = scSpot > 0 ? unhedgedImpactInr / scSpot : 0;

    // Net P&L
    const netPnlInr = hedgePnlInr + unhedgedImpactInr;
    const netPnlUsd = hedgePnlUsd + unhedgedImpactUsd;

    // Effective blended rate
    const hedgedValue = hedgeUsd * hRate;
    const unhedgedValue = unhedgedUsd * scSpot;
    const effectiveRate = totalUsd > 0 ? (hedgedValue + unhedgedValue) / totalUsd : scSpot;

    // Per-trade breakdown at scenario spot
    const tradeBreakdown = trades.map((t) => {
      const tradeMtb = t.mtbFx;
      const impact = (tradeMtb - scSpot) * t.usdInvoice;
      return {
        name: t.commodity.length > 18 ? t.commodity.slice(0, 18) + "..." : t.commodity,
        tradeId: t.tradeId,
        usdInvoice: t.usdInvoice,
        mtbRate: tradeMtb,
        impactInr: impact,
        impactUsd: scSpot > 0 ? impact / scSpot : 0,
      };
    });

    return {
      totalUsd,
      totalInr,
      totalMtb,
      totalMtm,
      blendedMtb,
      scSpot,
      hedgeUsd,
      hedgedPct,
      unhedgedUsd,
      unhedgedInr,
      hedgePnlInr,
      hedgePnlUsd,
      unhedgedImpactInr,
      unhedgedImpactUsd,
      netPnlInr,
      netPnlUsd,
      effectiveRate,
      tradeBreakdown,
    };
  }, [trades, scenarioSpot, liveSpot, hedgeAmountInr, hedgeRate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading simulator...</div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Simulator</h1>
        <p className="text-sm text-slate-400 mt-1">
          {trades.length} trades &middot; {formatUSD(analysis.totalUsd)} exposure &middot; What-if scenario analysis
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ─── LEFT PANE: Controls ─── */}
        <div className="lg:col-span-4 space-y-4">

          {/* Current Position */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Current Position
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Blended Book Rate</span>
                <span className="font-mono text-lg font-bold text-amber-400">
                  {analysis.blendedMtb.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Live Spot (USDINR)</span>
                <span className="font-mono text-lg font-bold text-cyan-400">
                  {liveSpot.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Total Exposure</span>
                <span className="font-mono text-sm text-slate-200">
                  {formatUSD(analysis.totalUsd)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">MTB / MTM</span>
                <span className="font-mono text-sm text-slate-200">
                  {formatUSD(analysis.totalMtb)} / {formatUSD(analysis.totalMtm)}
                </span>
              </div>
            </div>
          </div>

          {/* Scenario Spot */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Scenario USDINR
            </h3>
            <div className="text-center mb-3">
              <input
                type="number"
                step="0.01"
                className="input-field text-center text-2xl font-bold w-full"
                value={scenarioSpot}
                onChange={(e) => setScenarioSpot(e.target.value)}
              />
            </div>
            <input
              type="range"
              min={Math.max(liveSpot - 5, 80)}
              max={liveSpot + 5}
              step="0.01"
              value={Number(scenarioSpot) || liveSpot}
              onChange={(e) => setScenarioSpot(e.target.value)}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1">
              <span>{Math.max(liveSpot - 5, 80).toFixed(2)}</span>
              <span className="text-slate-400">Current: {liveSpot.toFixed(2)}</span>
              <span>{(liveSpot + 5).toFixed(2)}</span>
            </div>
            {/* Quick shortcuts */}
            <div className="flex gap-2 mt-3">
              {[-2, -1, 0, +1, +2].map((delta) => (
                <button
                  key={delta}
                  onClick={() => setScenarioSpot((liveSpot + delta).toFixed(4))}
                  className={`flex-1 text-xs py-1.5 rounded border transition-all ${
                    Math.abs(Number(scenarioSpot) - (liveSpot + delta)) < 0.01
                      ? "border-blue-500 bg-blue-500/10 text-blue-400"
                      : "border-[#2a3650] text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {delta === 0 ? "Spot" : delta > 0 ? `+${delta}` : `${delta}`}
                </button>
              ))}
            </div>
          </div>

          {/* Hedge Position */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Hedge Position
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Hedge Amount (INR)
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={hedgeAmountInr}
                  onChange={(e) => setHedgeAmountInr(e.target.value)}
                />
                <div className="text-[10px] text-slate-600 mt-1">
                  = {formatUSD(Number(hedgeRate) > 0 ? Number(hedgeAmountInr) / Number(hedgeRate) : 0)} USD
                  &middot; {formatINR(Number(hedgeAmountInr))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Hedge Rate (USDINR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={hedgeRate}
                  onChange={(e) => setHedgeRate(e.target.value)}
                />
              </div>
              {/* Quick presets */}
              <div className="flex gap-2">
                {[
                  { label: "No Hedge", inr: "0", rate: "0" },
                  { label: "50%", inr: String(Math.round(analysis.totalUsd * liveSpot * 0.5)), rate: liveSpot.toFixed(4) },
                  { label: "100%", inr: String(Math.round(analysis.totalUsd * liveSpot)), rate: liveSpot.toFixed(4) },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setHedgeAmountInr(preset.inr);
                      setHedgeRate(preset.rate);
                    }}
                    className="flex-1 text-xs py-1.5 rounded border border-[#2a3650] text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Coverage summary */}
          <div className="card bg-[#111827]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400">Hedged</span>
              <span className="text-xs font-mono text-blue-400">
                {Math.round(analysis.hedgedPct * 100)}%
              </span>
            </div>
            <div className="w-full h-2 bg-[#1e2a3f] rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(analysis.hedgedPct * 100, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Hedged</span>
                <span className="font-mono text-blue-400">
                  {formatUSD(analysis.hedgeUsd)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Unhedged</span>
                <span className="font-mono text-red-400">
                  {formatUSD(analysis.unhedgedUsd)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANE: Results ─── */}
        <div className="lg:col-span-8 space-y-4">

          {/* Headline P&L */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
              <div className="stat-label">Net P&L (INR)</div>
              <div className={`stat-value mt-1 ${analysis.netPnlInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                {analysis.netPnlInr >= 0 ? "+" : ""}{formatINR(analysis.netPnlInr)}
              </div>
            </div>
            <div className="card">
              <div className="stat-label">Net P&L (USD)</div>
              <div className={`stat-value mt-1 ${analysis.netPnlUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
                {analysis.netPnlUsd >= 0 ? "+" : ""}{formatUSD(analysis.netPnlUsd)}
              </div>
            </div>
            <div className="card">
              <div className="stat-label">Effective Rate</div>
              <div className="stat-value text-cyan-400 mt-1">
                {analysis.effectiveRate.toFixed(4)}
              </div>
            </div>
            <div className="card">
              <div className="stat-label">vs Book Rate</div>
              <div className={`stat-value mt-1 ${
                analysis.effectiveRate <= analysis.blendedMtb ? "text-green-400" : "text-red-400"
              }`}>
                {analysis.effectiveRate <= analysis.blendedMtb ? "" : "+"}{(analysis.effectiveRate - analysis.blendedMtb).toFixed(4)}
              </div>
            </div>
          </div>

          {/* Hedge vs Unhedged breakdown */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              P&L Breakdown at {analysis.scSpot.toFixed(4)}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[#2a3650]/50">
                  <span className="text-sm text-slate-400">Hedge P&L</span>
                  <div className="text-right">
                    <span className={`font-mono text-sm ${analysis.hedgePnlInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {analysis.hedgePnlInr >= 0 ? "+" : ""}{formatINR(analysis.hedgePnlInr)}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      ({analysis.hedgePnlUsd >= 0 ? "+" : ""}{formatUSD(analysis.hedgePnlUsd)})
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#2a3650]/50">
                  <span className="text-sm text-slate-400">Unhedged Impact</span>
                  <div className="text-right">
                    <span className={`font-mono text-sm ${analysis.unhedgedImpactInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {analysis.unhedgedImpactInr >= 0 ? "+" : ""}{formatINR(analysis.unhedgedImpactInr)}
                    </span>
                    <span className="text-xs text-slate-500 ml-2">
                      ({analysis.unhedgedImpactUsd >= 0 ? "+" : ""}{formatUSD(analysis.unhedgedImpactUsd)})
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 bg-[#111827] rounded-lg px-3 -mx-3">
                  <span className="text-sm font-semibold text-slate-200">Net P&L</span>
                  <div className="text-right">
                    <span className={`font-mono text-lg font-bold ${analysis.netPnlInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {analysis.netPnlInr >= 0 ? "+" : ""}{formatINR(analysis.netPnlInr)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[#2a3650]/50">
                  <span className="text-sm text-slate-400">Scenario Spot</span>
                  <span className="font-mono text-sm text-slate-200">{analysis.scSpot.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#2a3650]/50">
                  <span className="text-sm text-slate-400">Book Rate</span>
                  <span className="font-mono text-sm text-amber-400">{analysis.blendedMtb.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#2a3650]/50">
                  <span className="text-sm text-slate-400">Effective Rate</span>
                  <span className="font-mono text-sm text-cyan-400">{analysis.effectiveRate.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[#2a3650]/50">
                  <span className="text-sm text-slate-400">Hedged / Unhedged</span>
                  <span className="text-sm text-slate-200">
                    {formatUSD(analysis.hedgeUsd)} / {formatUSD(analysis.unhedgedUsd)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trade-level impact chart */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Impact by Trade (Unhedged, at {analysis.scSpot.toFixed(2)})
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analysis.tradeBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3650" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#94a3b8", fontSize: 9 }}
                  axisLine={{ stroke: "#2a3650" }}
                  angle={-15}
                  textAnchor="end"
                  height={55}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={{ stroke: "#2a3650" }}
                  tickFormatter={(v) => {
                    if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(0)}L`;
                    if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`;
                    return `₹${v}`;
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a2234",
                    border: "1px solid #2a3650",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                  formatter={(value: number, name: string) => [
                    name === "impactInr" ? formatINR(value) : formatUSD(value),
                    name === "impactInr" ? "Impact (INR)" : "Impact (USD)",
                  ]}
                />
                <ReferenceLine y={0} stroke="#64748b" />
                <Bar dataKey="impactInr" radius={[4, 4, 0, 0]}>
                  {analysis.tradeBreakdown.map((entry, idx) => (
                    <Cell key={idx} fill={entry.impactInr >= 0 ? "#22c55e" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Trade-level table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2a3650]">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Per-Trade Detail
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3650]">
                    <th className="table-header">Trade</th>
                    <th className="table-header">USD Exposure</th>
                    <th className="table-header">Book Rate</th>
                    <th className="table-header">Scenario Spot</th>
                    <th className="table-header">Impact (INR)</th>
                    <th className="table-header">Impact (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3650]/50">
                  {analysis.tradeBreakdown.map((t) => (
                    <tr key={t.tradeId} className="hover:bg-[#1e2a3f]">
                      <td className="table-cell text-slate-200 text-xs">{t.name}</td>
                      <td className="table-cell font-mono text-slate-300 text-xs">{formatUSD(t.usdInvoice)}</td>
                      <td className="table-cell font-mono text-amber-400 text-xs">{t.mtbRate.toFixed(4)}</td>
                      <td className="table-cell font-mono text-slate-400 text-xs">{analysis.scSpot.toFixed(4)}</td>
                      <td className={`table-cell font-mono text-xs ${t.impactInr >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.impactInr >= 0 ? "+" : ""}{formatINR(t.impactInr)}
                      </td>
                      <td className={`table-cell font-mono text-xs ${t.impactUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.impactUsd >= 0 ? "+" : ""}{formatUSD(t.impactUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
