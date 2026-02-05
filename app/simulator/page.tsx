"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

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

type HedgeRow = {
  id: number;
  amountInr: string;
  rate: string;
  expiry: string; // YYYY-MM-DD
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

let hedgeIdCounter = 1;

export default function SimulatorPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [liveSpot, setLiveSpot] = useState(0);
  const [fxSource, setFxSource] = useState("");
  const [scenarioSpot, setScenarioSpot] = useState("");
  const [loading, setLoading] = useState(true);

  // Hedge rows
  const [hedges, setHedges] = useState<HedgeRow[]>([
    { id: hedgeIdCounter++, amountInr: "0", rate: "0", expiry: "" },
  ]);

  // Trade selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionApplied, setSelectionApplied] = useState(false);

  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("/api/fx");
      const data = await res.json();
      if (data.fx?.spot) {
        setLiveSpot(data.fx.spot);
        setFxSource(data.source || "");
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
    ]).then(([td, fd]) => {
      setTrades(td.trades || []);
      const spot = fd.fx?.spot || 90.29;
      setLiveSpot(spot);
      setFxSource(fd.source || "");
      setScenarioSpot(spot.toFixed(4));
      setLoading(false);
    });

    const interval = setInterval(fetchFx, 60_000);
    return () => clearInterval(interval);
  }, [fetchFx]);

  // ── Hedge row management ──
  function addHedge() {
    setHedges((prev) => [
      ...prev,
      { id: hedgeIdCounter++, amountInr: "0", rate: "0", expiry: "" },
    ]);
  }

  function removeHedge(id: number) {
    setHedges((prev) => (prev.length <= 1 ? prev : prev.filter((h) => h.id !== id)));
  }

  function updateHedge(id: number, field: keyof Omit<HedgeRow, "id">, value: string) {
    setHedges((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: value } : h))
    );
  }

  // ── Trade selection ──
  function toggleTrade(tradeId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tradeId)) next.delete(tradeId);
      else next.add(tradeId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(trades.map((t) => t.tradeId)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectionApplied(false);
  }

  function applySelection() {
    setSelectionApplied(selectedIds.size > 0);
  }

  // ── The effective rate to use for P&L: scenario if set, else live spot ──
  const effectiveSpot = Number(scenarioSpot) || liveSpot;

  // ── Scope: selected trades if applied, otherwise all ──
  const scopeTrades = useMemo(() => {
    if (selectionApplied && selectedIds.size > 0) {
      return trades.filter((t) => selectedIds.has(t.tradeId));
    }
    return trades;
  }, [trades, selectedIds, selectionApplied]);

  // ── Hedge allocation: top-to-bottom, earliest receipts first ──
  const analysis = useMemo(() => {
    if (scopeTrades.length === 0) return null;

    // Sort scope trades by sale date (earliest first) for allocation
    const sorted = [...scopeTrades].sort((a, b) =>
      a.inrSaleDate.localeCompare(b.inrSaleDate)
    );

    // Parse hedges
    const parsedHedges = hedges
      .map((h) => ({
        amountInr: Math.max(Number(h.amountInr) || 0, 0),
        rate: Number(h.rate) || 0,
        expiry: h.expiry || "",
      }))
      .filter((h) => h.amountInr > 0 && h.rate > 0);

    // Per-trade allocation tracking
    const tradeAllocations: Map<string, { hedgedInr: number; hedgedUsd: number }> = new Map();
    sorted.forEach((t) => tradeAllocations.set(t.tradeId, { hedgedInr: 0, hedgedUsd: 0 }));

    // Allocate each hedge top-to-bottom across eligible trades
    for (const hedge of parsedHedges) {
      let remaining = hedge.amountInr;

      for (const trade of sorted) {
        if (remaining <= 0) break;

        // If hedge has an expiry, only cover trades whose sale date <= hedge expiry
        if (hedge.expiry && trade.inrSaleDate > hedge.expiry) continue;

        const alloc = tradeAllocations.get(trade.tradeId)!;
        const tradeUnhedged = trade.inrSale - alloc.hedgedInr;

        if (tradeUnhedged <= 0) continue;

        const allocAmount = Math.min(remaining, tradeUnhedged);
        alloc.hedgedInr += allocAmount;
        alloc.hedgedUsd += hedge.rate > 0 ? allocAmount / hedge.rate : 0;
        remaining -= allocAmount;
      }
    }

    // Compute results per trade
    const tradeResults = sorted.map((t) => {
      const alloc = tradeAllocations.get(t.tradeId)!;
      const unhedgedInr = t.inrSale - alloc.hedgedInr;
      const usdUnhedged = effectiveSpot > 0 ? t.inrSale / effectiveSpot : 0;
      const usdWithHedge =
        alloc.hedgedUsd + (effectiveSpot > 0 ? unhedgedInr / effectiveSpot : 0);

      // Mark to Book USD = inrSale / mtbFx (what the trade was booked at)
      const mtbUsd = t.mtbFx > 0 ? t.inrSale / t.mtbFx : 0;
      // Mark to Market USD = inrSale / mtmFx
      const mtmUsd = (t.mtmFx && t.mtmFx > 0) ? t.inrSale / t.mtmFx : usdUnhedged;

      return {
        ...t,
        hedgedInr: alloc.hedgedInr,
        hedgedUsd: alloc.hedgedUsd,
        usdUnhedged,
        usdWithHedge,
        mtbUsd,
        mtmUsd,
      };
    });

    const totalInr = tradeResults.reduce((s, t) => s + t.inrSale, 0);
    const totalHedgedInr = tradeResults.reduce((s, t) => s + t.hedgedInr, 0);
    const totalUsdUnhedged = tradeResults.reduce((s, t) => s + t.usdUnhedged, 0);
    const totalUsdWithHedge = tradeResults.reduce((s, t) => s + t.usdWithHedge, 0);
    const hedgeBenefitUsd = totalUsdWithHedge - totalUsdUnhedged;
    const effectiveAvgRate =
      totalUsdWithHedge > 0 ? totalInr / totalUsdWithHedge : effectiveSpot;

    // Blended MTB rate across scope
    const totalUsdExposure = tradeResults.reduce((s, t) => s + t.usdInvoice, 0);
    const blendedMtb =
      totalUsdExposure > 0
        ? tradeResults.reduce((s, t) => s + t.mtbFx * t.usdInvoice, 0) / totalUsdExposure
        : 0;

    // P&L impact: difference between book and scenario/live rate
    // Positive MTB rate vs lower spot = you get fewer USD per INR = loss
    const pnlVsBookUsd = totalUsdUnhedged - (blendedMtb > 0 ? totalInr / blendedMtb : 0);

    return {
      tradeResults,
      totalInr,
      totalHedgedInr,
      totalUsdUnhedged,
      totalUsdWithHedge,
      hedgeBenefitUsd,
      effectiveAvgRate,
      blendedMtb,
      totalUsdExposure,
      pnlVsBookUsd,
      scopeLabel: selectionApplied && selectedIds.size > 0
        ? `Selected: ${selectedIds.size}`
        : "All trades",
    };
  }, [scopeTrades, hedges, effectiveSpot, selectionApplied, selectedIds.size]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading simulator...</div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="max-w-[1400px]">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Simulator</h1>
        <p className="text-sm text-slate-400 mt-1">
          {trades.length} trades &middot; {formatUSD(analysis.totalUsdExposure)} exposure
          &middot; Hedge &amp; scenario analysis
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ═══════════════════════ LEFT PANE ═══════════════════════ */}
        <div className="lg:col-span-4 space-y-4">

          {/* Current Position */}
          <div className="card">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Current Position
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Mark-to-Book Rate</span>
                <span className="font-mono text-lg font-bold text-amber-400">
                  {analysis.blendedMtb.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Live Spot (USDINR)</span>
                <div className="text-right">
                  <span className="font-mono text-lg font-bold text-cyan-400">
                    {liveSpot.toFixed(4)}
                  </span>
                  {fxSource && (
                    <div className="text-[10px] text-slate-600">{fxSource}</div>
                  )}
                </div>
              </div>
              <div className="border-t border-[#2a3650]/50 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Spot vs Book P&L</span>
                  <span className={`font-mono text-sm font-bold ${analysis.pnlVsBookUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {analysis.pnlVsBookUsd >= 0 ? "+" : ""}{formatUSD(analysis.pnlVsBookUsd)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  At {effectiveSpot.toFixed(4)} vs booked {analysis.blendedMtb.toFixed(4)}
                </div>
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

          {/* Hedges */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Hedges (Optional)
              </h3>
              <button
                onClick={addHedge}
                className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-2 py-1 hover:bg-blue-500/10 transition-colors"
              >
                + Add hedge
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mb-3">
              Add as many hedge instruments as you want. Only three fields matter.
            </p>

            {/* Hedge header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 mb-2">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Hedge Amount (INR)</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Hedge Rate</div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Expiry</div>
              <div />
            </div>

            {/* Hedge rows */}
            {hedges.map((h) => (
              <div key={h.id} className="grid grid-cols-[1fr_1fr_1fr_28px] gap-2 mb-2">
                <input
                  type="number"
                  className="input-field text-xs py-1.5"
                  placeholder="0"
                  value={h.amountInr}
                  onChange={(e) => updateHedge(h.id, "amountInr", e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  className="input-field text-xs py-1.5"
                  placeholder="0"
                  value={h.rate}
                  onChange={(e) => updateHedge(h.id, "rate", e.target.value)}
                />
                <input
                  type="date"
                  className="input-field text-xs py-1.5"
                  value={h.expiry}
                  onChange={(e) => updateHedge(h.id, "expiry", e.target.value)}
                />
                <button
                  onClick={() => removeHedge(h.id)}
                  className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}

            <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
              Allocation: hedges are applied <strong className="text-slate-400">top-to-bottom</strong> and cover{" "}
              <strong className="text-slate-400">earliest receipts first</strong> up to each hedge&apos;s expiry.
            </p>
          </div>

          {/* UX hint */}
          <div className="card bg-[#111827] border-dashed border-[#2a3650]">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              UX rule: left side changes → right side updates instantly. No extra buttons needed.
            </p>
          </div>
        </div>

        {/* ═══════════════════════ RIGHT PANE ═══════════════════════ */}
        <div className="lg:col-span-8 space-y-4">

          {/* Results header */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Results</h2>
              <span className="text-xs font-mono text-slate-400 border border-[#2a3650] rounded px-3 py-1">
                Scope: {analysis.scopeLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[#111827] rounded-lg border border-[#2a3650]">
                <div className="text-xs text-slate-500">Total INR Receivables (scope)</div>
                <div className="text-xl font-bold text-amber-400 mt-1 font-mono">
                  {formatINR(analysis.totalInr)}
                </div>
              </div>
              <div className="p-4 bg-[#111827] rounded-lg border border-[#2a3650]">
                <div className="text-xs text-slate-500">INR Covered by Hedges (allocated)</div>
                <div className="text-xl font-bold text-cyan-400 mt-1 font-mono">
                  {formatINR(analysis.totalHedgedInr)}
                </div>
              </div>
              <div className="p-4 bg-[#111827] rounded-lg border border-[#2a3650]">
                <div className="text-xs text-slate-500">USD if Unhedged (all at scenario spot)</div>
                <div className="text-xl font-bold text-slate-200 mt-1 font-mono">
                  {formatUSD(analysis.totalUsdUnhedged)}
                </div>
              </div>
              <div className="p-4 bg-[#111827] rounded-lg border border-[#2a3650]">
                <div className="text-xs text-slate-500">USD with Hedges + Spot</div>
                <div className="text-xl font-bold text-slate-200 mt-1 font-mono">
                  {formatUSD(analysis.totalUsdWithHedge)}
                </div>
              </div>
              <div className="p-4 bg-[#111827] rounded-lg border border-[#2a3650]">
                <div className="text-xs text-slate-500">Hedge Benefit (USD)</div>
                <div className={`text-xl font-bold mt-1 font-mono ${analysis.hedgeBenefitUsd >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {analysis.hedgeBenefitUsd >= 0 ? "+" : ""}{formatUSD(analysis.hedgeBenefitUsd)}
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Positive = hedge improves USD proceeds vs scenario unhedged
                </div>
              </div>
              <div className="p-4 bg-[#111827] rounded-lg border border-[#2a3650]">
                <div className="text-xs text-slate-500">Effective Avg Conversion (USDINR)</div>
                <div className="text-xl font-bold text-cyan-400 mt-1 font-mono">
                  {analysis.effectiveAvgRate.toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          {/* Trade-Level View */}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2a3650] flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Trade-Level View
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">
                  Select by{" "}
                  <span className="font-mono text-slate-300">Manual (checkboxes)</span>
                </span>
                <span className="text-xs font-mono text-slate-400 border border-[#2a3650] rounded px-2 py-0.5">
                  Selected: {selectedIds.size}
                </span>
                <button
                  onClick={applySelection}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${
                    selectedIds.size > 0
                      ? "border-blue-500 text-blue-400 hover:bg-blue-500/10"
                      : "border-[#2a3650] text-slate-600 cursor-not-allowed"
                  }`}
                  disabled={selectedIds.size === 0}
                >
                  Apply
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs px-3 py-1 rounded border border-[#2a3650] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={selectAll}
                  className="text-xs px-3 py-1 rounded border border-[#2a3650] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Select all
                </button>
              </div>
            </div>
            <div className="px-5 py-2 border-b border-[#2a3650]/50">
              <p className="text-[10px] text-slate-600">
                If nothing is selected, scope automatically becomes <strong className="text-slate-400">All trades</strong>.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3650]">
                    <th className="table-header w-10"></th>
                    <th className="table-header">ID</th>
                    <th className="table-header">Commodity</th>
                    <th className="table-header">INR Receipt Date</th>
                    <th className="table-header text-right">INR Receivable</th>
                    <th className="table-header text-right">Hedged INR</th>
                    <th className="table-header text-right">USD (Unhedged)</th>
                    <th className="table-header text-right">USD (With Hedge)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3650]/50">
                  {analysis.tradeResults.map((t) => (
                    <tr
                      key={t.tradeId}
                      className={`hover:bg-[#1e2a3f] transition-colors ${
                        selectedIds.has(t.tradeId) ? "bg-blue-500/5" : ""
                      }`}
                    >
                      <td className="table-cell">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.tradeId)}
                          onChange={() => toggleTrade(t.tradeId)}
                          className="accent-blue-500 w-3.5 h-3.5"
                        />
                      </td>
                      <td className="table-cell font-mono text-cyan-400 text-xs">
                        {t.tradeId}
                      </td>
                      <td className="table-cell text-slate-200 text-xs">
                        {t.commodity.length > 20 ? t.commodity.slice(0, 20) + "..." : t.commodity}
                      </td>
                      <td className="table-cell font-mono text-slate-400 text-xs">
                        {t.inrSaleDate}
                      </td>
                      <td className="table-cell font-mono text-amber-400 text-xs text-right">
                        {formatINR(t.inrSale)}
                      </td>
                      <td className="table-cell font-mono text-xs text-right">
                        <span className={t.hedgedInr > 0 ? "text-green-400" : "text-slate-600"}>
                          {formatINR(t.hedgedInr)}
                        </span>
                      </td>
                      <td className="table-cell font-mono text-slate-300 text-xs text-right">
                        {formatUSD(t.usdUnhedged)}
                      </td>
                      <td className="table-cell font-mono text-slate-200 text-xs text-right">
                        {formatUSD(t.usdWithHedge)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#2a3650] bg-[#111827]">
                    <td className="table-cell" colSpan={4}>
                      <span className="text-xs font-semibold text-slate-400">
                        Total ({analysis.tradeResults.length} trades)
                      </span>
                    </td>
                    <td className="table-cell font-mono text-amber-400 text-xs text-right font-bold">
                      {formatINR(analysis.totalInr)}
                    </td>
                    <td className="table-cell font-mono text-xs text-right font-bold">
                      <span className={analysis.totalHedgedInr > 0 ? "text-green-400" : "text-slate-600"}>
                        {formatINR(analysis.totalHedgedInr)}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-slate-300 text-xs text-right font-bold">
                      {formatUSD(analysis.totalUsdUnhedged)}
                    </td>
                    <td className="table-cell font-mono text-slate-200 text-xs text-right font-bold">
                      {formatUSD(analysis.totalUsdWithHedge)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
