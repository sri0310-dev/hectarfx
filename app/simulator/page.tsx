"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";

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

type ActiveHedge = {
  id: string;
  ticketNo: string;
  bank: string;
  type: string;
  direction: string;
  usdAmount: number;
  rate: number;
  inrAmount: number;
  settlementDate: string;
  status: string;
};

type SimHedge = {
  id: number;
  amountInr: string;
  rate: string;
  expiry: string;
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

// Extract base commodity: "Almonds - Crown" → "Almonds", "Soybean-MOI 1" → "Soybean"
function baseCommodity(c: string): string {
  const base = c.split(/[-–]/)[0].trim();
  // Normalize common names
  if (/^almond/i.test(base)) return "Almonds";
  if (/^soy/i.test(base)) return "Soybean";
  if (/^rcn/i.test(base)) return "RCN";
  return base;
}

let simIdCounter = 1;

export default function SimulatorPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [liveSpot, setLiveSpot] = useState(0);
  const [fxSource, setFxSource] = useState("");
  const [scenarioSpot, setScenarioSpot] = useState("");
  const [loading, setLoading] = useState(true);

  const [activeHedges, setActiveHedges] = useState<ActiveHedge[]>([]);
  const [simHedges, setSimHedges] = useState<SimHedge[]>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionApplied, setSelectionApplied] = useState(false);
  const [selectBy, setSelectBy] = useState<"manual" | "month" | "commodity">("manual");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterCommodity, setFilterCommodity] = useState("");

  const fetchFx = useCallback(async () => {
    try {
      const res = await fetch("/api/fx");
      const data = await res.json();
      if (data.fx?.spot) { setLiveSpot(data.fx.spot); setFxSource(data.source || ""); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/trades").then((r) => r.json()),
      fetch("/api/fx").then((r) => r.json()),
      fetch("/api/hedges").then((r) => r.json()),
    ]).then(([td, fd, hd]) => {
      setTrades(td.trades || []);
      const spot = fd.fx?.spot || 90.29;
      setLiveSpot(spot);
      setFxSource(fd.source || "");
      setScenarioSpot(spot.toFixed(4));
      setActiveHedges((hd.hedges || []).filter((h: ActiveHedge) => h.status === "ACTIVE"));
      setLoading(false);
    });
    const interval = setInterval(fetchFx, 60_000);
    return () => clearInterval(interval);
  }, [fetchFx]);

  // Sim hedge management
  function addSimHedge() {
    setSimHedges((prev) => [...prev, { id: simIdCounter++, amountInr: "0", rate: "0", expiry: "" }]);
  }
  function removeSimHedge(id: number) {
    setSimHedges((prev) => prev.filter((h) => h.id !== id));
  }
  function updateSimHedge(id: number, field: keyof Omit<SimHedge, "id">, value: string) {
    setSimHedges((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }

  // Trade selection
  function toggleTrade(tid: string) {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(tid)) n.delete(tid); else n.add(tid); return n; });
  }
  function selectAll() { setSelectedIds(new Set(trades.map((t) => t.tradeId))); }
  function clearSelection() { setSelectedIds(new Set()); setSelectionApplied(false); }
  function applySelection() { setSelectionApplied(selectedIds.size > 0); }

  function applyFilter() {
    if (selectBy === "month" && filterMonth) {
      const ids = trades.filter((t) => t.inrSaleDate.startsWith(filterMonth)).map((t) => t.tradeId);
      setSelectedIds(new Set(ids)); setSelectionApplied(ids.length > 0);
    } else if (selectBy === "commodity" && filterCommodity) {
      const ids = trades.filter((t) => baseCommodity(t.commodity) === filterCommodity).map((t) => t.tradeId);
      setSelectedIds(new Set(ids)); setSelectionApplied(ids.length > 0);
    }
  }

  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    trades.forEach((t) => { if (t.inrSaleDate) s.add(t.inrSaleDate.slice(0, 7)); });
    return Array.from(s).sort();
  }, [trades]);

  // Base commodity names for filter (Almonds, Soybean, RCN)
  const availableCommodities = useMemo(() => {
    const s = new Set<string>();
    trades.forEach((t) => s.add(baseCommodity(t.commodity)));
    return Array.from(s).sort();
  }, [trades]);

  const effectiveSpot = Number(scenarioSpot) || liveSpot;

  const scopeTrades = useMemo(() => {
    if (selectionApplied && selectedIds.size > 0) return trades.filter((t) => selectedIds.has(t.tradeId));
    return trades;
  }, [trades, selectedIds, selectionApplied]);

  // Combined hedge allocation + MTB-focused analysis
  const analysis = useMemo(() => {
    if (scopeTrades.length === 0) return null;

    const sorted = [...scopeTrades].sort((a, b) => a.inrSaleDate.localeCompare(b.inrSaleDate));

    // Build hedge list: active first, then simulation
    const allHedges: { amountInr: number; rate: number; expiry: string }[] = [];
    activeHedges.forEach((h) => {
      if (h.status === "ACTIVE") allHedges.push({ amountInr: h.inrAmount, rate: h.rate, expiry: h.settlementDate });
    });
    simHedges.forEach((h) => {
      const amt = Math.max(Number(h.amountInr) || 0, 0);
      const rate = Number(h.rate) || 0;
      if (amt > 0 && rate > 0) allHedges.push({ amountInr: amt, rate, expiry: h.expiry || "" });
    });

    // Per-trade allocation
    const allocs: Map<string, { hedgedInr: number; hedgedUsd: number }> = new Map();
    sorted.forEach((t) => allocs.set(t.tradeId, { hedgedInr: 0, hedgedUsd: 0 }));

    for (const hedge of allHedges) {
      let rem = hedge.amountInr;
      for (const trade of sorted) {
        if (rem <= 0) break;
        if (hedge.expiry && trade.inrSaleDate > hedge.expiry) continue;
        const a = allocs.get(trade.tradeId)!;
        const unhedged = trade.inrSale - a.hedgedInr;
        if (unhedged <= 0) continue;
        const take = Math.min(rem, unhedged);
        a.hedgedInr += take;
        a.hedgedUsd += hedge.rate > 0 ? take / hedge.rate : 0;
        rem -= take;
      }
    }

    const tradeResults = sorted.map((t) => {
      const a = allocs.get(t.tradeId)!;
      const unhedgedInr = t.inrSale - a.hedgedInr;
      // USD at Book = what the trader expected (INR receivable / MTB rate)
      const usdAtBook = t.mtbFx > 0 ? t.inrSale / t.mtbFx : 0;
      // USD at scenario (unhedged, no hedges)
      const usdUnhedged = effectiveSpot > 0 ? t.inrSale / effectiveSpot : 0;
      // USD at scenario with hedges
      const usdWithHedge = a.hedgedUsd + (effectiveSpot > 0 ? unhedgedInr / effectiveSpot : 0);
      // P&L vs Book (North Star): positive = beating the book rate
      const pnlVsBook = usdWithHedge - usdAtBook;
      // Hedge benefit: difference hedges make vs pure unhedged at scenario
      const hedgeBenefit = usdWithHedge - usdUnhedged;

      return {
        ...t,
        baseCommodity: baseCommodity(t.commodity),
        hedgedInr: a.hedgedInr,
        usdAtBook,
        usdUnhedged,
        usdWithHedge,
        pnlVsBook,
        hedgeBenefit,
      };
    });

    const totalInr = tradeResults.reduce((s, t) => s + t.inrSale, 0);
    const totalHedgedInr = tradeResults.reduce((s, t) => s + t.hedgedInr, 0);
    const totalUsdAtBook = tradeResults.reduce((s, t) => s + t.usdAtBook, 0);
    const totalUsdWithHedge = tradeResults.reduce((s, t) => s + t.usdWithHedge, 0);
    const totalPnlVsBook = tradeResults.reduce((s, t) => s + t.pnlVsBook, 0);
    const totalHedgeBenefit = tradeResults.reduce((s, t) => s + t.hedgeBenefit, 0);
    const totalUsdExposure = tradeResults.reduce((s, t) => s + t.usdInvoice, 0);
    const blendedMtb = totalUsdExposure > 0
      ? tradeResults.reduce((s, t) => s + t.mtbFx * t.usdInvoice, 0) / totalUsdExposure : 0;
    const effectiveAvgRate = totalUsdWithHedge > 0 ? totalInr / totalUsdWithHedge : effectiveSpot;

    // Weighted avg hedge rate
    const totalHedgeUsd = activeHedges.filter((h) => h.status === "ACTIVE").reduce((s, h) => s + h.usdAmount, 0);
    const weightedAvgHedgeRate = totalHedgeUsd > 0
      ? activeHedges.filter((h) => h.status === "ACTIVE").reduce((s, h) => s + h.rate * h.usdAmount, 0) / totalHedgeUsd : 0;

    return {
      tradeResults,
      totalInr,
      totalHedgedInr,
      totalUsdAtBook,
      totalUsdWithHedge,
      totalPnlVsBook,
      totalHedgeBenefit,
      effectiveAvgRate,
      blendedMtb,
      totalUsdExposure,
      weightedAvgHedgeRate,
      scopeLabel: selectionApplied && selectedIds.size > 0 ? `Selected: ${selectedIds.size}` : "All trades",
    };
  }, [scopeTrades, activeHedges, simHedges, effectiveSpot, selectionApplied, selectedIds.size]);

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="text-slate-400">Loading simulator...</div></div>;
  }
  if (!analysis) return null;

  return (
    <div className="max-w-[1400px]">
      <div className="mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-white">Simulator</h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">
          {trades.length} trades &middot; {formatUSD(analysis.totalUsdExposure)} exposure
          &middot; {activeHedges.length} active hedge{activeHedges.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5">
        {/* ═══ LEFT PANE ═══ */}
        <div className="lg:col-span-4 space-y-3">

          {/* Current Position */}
          <div className="card py-3 px-4">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Current Position</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Mark-to-Book</span>
                <span className="font-mono text-sm font-bold text-amber-400">{analysis.blendedMtb.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Live Spot</span>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-cyan-400">{liveSpot.toFixed(4)}</span>
                  {fxSource && <span className="text-[9px] text-slate-600 ml-1">({fxSource})</span>}
                </div>
              </div>
              <div className="border-t border-[#2a3650]/50 pt-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">vs Book P&L</span>
                  <span className={`font-mono text-sm font-bold ${analysis.totalPnlVsBook >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {analysis.totalPnlVsBook >= 0 ? "+" : ""}{formatUSD(analysis.totalPnlVsBook)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Scenario Spot */}
          <div className="card py-3 px-4">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Scenario USDINR</h3>
            <input
              type="number"
              step="0.01"
              className="input-field text-center text-xl font-bold w-full mb-2"
              value={scenarioSpot}
              onChange={(e) => setScenarioSpot(e.target.value)}
            />
            <input
              type="range"
              min={Math.max(liveSpot - 5, 80)}
              max={liveSpot + 5}
              step="0.01"
              value={Number(scenarioSpot) || liveSpot}
              onChange={(e) => setScenarioSpot(e.target.value)}
              className="w-full accent-blue-500"
            />
            <div className="flex gap-1.5 mt-2">
              {[-2, -1, 0, +1, +2].map((delta) => (
                <button
                  key={delta}
                  onClick={() => setScenarioSpot((liveSpot + delta).toFixed(4))}
                  className={`flex-1 text-[10px] py-1 rounded border transition-all ${
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

          {/* Active Hedges */}
          <div className="card py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Active Hedges ({activeHedges.length})
              </h3>
              <Link href="/hedges" className="text-[10px] text-blue-400 hover:text-blue-300">Manage &rarr;</Link>
            </div>
            {activeHedges.length > 0 ? (
              <div className="space-y-1.5">
                {activeHedges.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-[#2a3650]/30 last:border-0">
                    <div>
                      <span className="font-mono text-cyan-400">{formatUSD(h.usdAmount)}</span>
                      <span className="text-slate-500 mx-1">@</span>
                      <span className="font-mono text-amber-400">{h.rate.toFixed(4)}</span>
                    </div>
                    <span className="font-mono text-slate-500 text-[10px]">{h.settlementDate}</span>
                  </div>
                ))}
                <div className="text-[10px] text-slate-600 pt-1">
                  Total: {formatINR(activeHedges.reduce((s, h) => s + h.inrAmount, 0))} @ {analysis.weightedAvgHedgeRate.toFixed(4)} avg
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-600">No active hedges. <Link href="/hedges" className="text-blue-400">Add one</Link></p>
            )}
          </div>

          {/* Simulation Hedges */}
          <div className="card py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Simulation Hedges</h3>
              <button onClick={addSimHedge} className="text-[10px] text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5">+ Add</button>
            </div>
            {simHedges.length > 0 ? (
              <>
                <div className="grid grid-cols-[1fr_1fr_1fr_20px] gap-1.5 mb-1.5">
                  <span className="text-[9px] text-slate-600 uppercase">INR Amt</span>
                  <span className="text-[9px] text-slate-600 uppercase">Rate</span>
                  <span className="text-[9px] text-slate-600 uppercase">Expiry</span>
                  <span />
                </div>
                {simHedges.map((h) => (
                  <div key={h.id} className="grid grid-cols-[1fr_1fr_1fr_20px] gap-1.5 mb-1.5">
                    <input type="number" className="input-field text-[10px] py-1" value={h.amountInr} onChange={(e) => updateSimHedge(h.id, "amountInr", e.target.value)} />
                    <input type="number" step="0.01" className="input-field text-[10px] py-1" value={h.rate} onChange={(e) => updateSimHedge(h.id, "rate", e.target.value)} />
                    <input type="date" className="input-field text-[10px] py-1" value={h.expiry} onChange={(e) => updateSimHedge(h.id, "expiry", e.target.value)} />
                    <button onClick={() => removeSimHedge(h.id)} className="text-slate-600 hover:text-red-400 text-[10px]">✕</button>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-[10px] text-slate-600 italic">None. Click &quot;+ Add&quot; for what-if hedges.</p>
            )}
            <p className="text-[9px] text-slate-600 mt-2">
              Hedges allocated <strong className="text-slate-400">top-to-bottom</strong>, <strong className="text-slate-400">earliest receipts first</strong>.
            </p>
          </div>
        </div>

        {/* ═══ RIGHT PANE ═══ */}
        <div className="lg:col-span-8 space-y-3">

          {/* Compact Results */}
          <div className="card py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-300">Results</h3>
              <span className="text-[10px] font-mono text-slate-500 border border-[#2a3650] rounded px-2 py-0.5">
                {analysis.scopeLabel}
              </span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-2 md:gap-3">
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">INR Receivables</div>
                <div className="text-xs md:text-sm font-bold text-amber-400 font-mono">{formatINR(analysis.totalInr)}</div>
              </div>
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">INR Hedged</div>
                <div className="text-xs md:text-sm font-bold text-cyan-400 font-mono">{formatINR(analysis.totalHedgedInr)}</div>
                {analysis.weightedAvgHedgeRate > 0 && (
                  <div className="text-[8px] text-slate-600 font-mono">@ {analysis.weightedAvgHedgeRate.toFixed(2)}</div>
                )}
              </div>
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">USD at Book</div>
                <div className="text-xs md:text-sm font-bold text-slate-300 font-mono">{formatUSD(analysis.totalUsdAtBook)}</div>
              </div>
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">USD at Scenario</div>
                <div className="text-xs md:text-sm font-bold text-slate-200 font-mono">{formatUSD(analysis.totalUsdWithHedge)}</div>
              </div>
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">vs Book P&L</div>
                <div className={`text-xs md:text-sm font-bold font-mono ${analysis.totalPnlVsBook >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {analysis.totalPnlVsBook >= 0 ? "+" : ""}{formatUSD(analysis.totalPnlVsBook)}
                </div>
              </div>
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">Hedge Benefit</div>
                <div className={`text-xs md:text-sm font-bold font-mono ${analysis.totalHedgeBenefit >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {analysis.totalHedgeBenefit >= 0 ? "+" : ""}{formatUSD(analysis.totalHedgeBenefit)}
                </div>
              </div>
              <div>
                <div className="text-[8px] md:text-[9px] text-slate-500 uppercase">Eff. Rate</div>
                <div className="text-xs md:text-sm font-bold text-cyan-400 font-mono">{analysis.effectiveAvgRate.toFixed(4)}</div>
              </div>
            </div>
          </div>

          {/* Trade-Level View */}
          <div className="card p-0 overflow-hidden">
            <div className="px-3 md:px-4 py-3 border-b border-[#2a3650]">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Trade-Level View</div>

              {/* Filter controls - stacks on mobile */}
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] md:text-xs text-slate-400">Select by</span>
                  <select
                    className="input-field text-[10px] md:text-xs py-1 px-1.5 md:px-2 w-auto"
                    value={selectBy}
                    onChange={(e) => setSelectBy(e.target.value as "manual" | "month" | "commodity")}
                  >
                    <option value="manual">Manual (checkboxes)</option>
                    <option value="month">Month</option>
                    <option value="commodity">Commodity</option>
                  </select>
                </div>

                {selectBy === "month" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] md:text-xs text-slate-400">Month</span>
                    <select className="input-field text-[10px] md:text-xs py-1 px-1.5 w-auto" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                      <option value="">All</option>
                      {availableMonths.map((m) => {
                        const d = new Date(m + "-01");
                        return <option key={m} value={m}>{d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>;
                      })}
                    </select>
                    <button onClick={applyFilter} className="text-[10px] px-2 py-1 rounded border border-blue-500 text-blue-400">Apply</button>
                  </div>
                )}

                {selectBy === "commodity" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] md:text-xs text-slate-400">Commodity</span>
                    <select className="input-field text-[10px] md:text-xs py-1 px-1.5 w-auto" value={filterCommodity} onChange={(e) => setFilterCommodity(e.target.value)}>
                      <option value="">All</option>
                      {availableCommodities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={applyFilter} className="text-[10px] px-2 py-1 rounded border border-blue-500 text-blue-400">Apply</button>
                  </div>
                )}

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[10px] font-mono text-slate-500 border border-[#2a3650] rounded px-1.5 py-0.5">
                    Selected: {selectedIds.size}
                  </span>
                  <button onClick={applySelection} disabled={selectedIds.size === 0}
                    className={`text-[10px] px-2 py-1 rounded border ${selectedIds.size > 0 ? "border-blue-500 text-blue-400" : "border-[#2a3650] text-slate-600 cursor-not-allowed"}`}>Apply</button>
                  <button onClick={clearSelection} className="text-[10px] px-2 py-1 rounded border border-[#2a3650] text-slate-500 hover:text-slate-300">Clear</button>
                  <button onClick={selectAll} className="text-[10px] px-2 py-1 rounded border border-[#2a3650] text-slate-500 hover:text-slate-300">Select all</button>
                </div>
              </div>

              <p className="text-[8px] md:text-[9px] text-slate-600 mt-1.5">
                If nothing selected, scope = <strong className="text-slate-400">All trades</strong>. North Star: beat the mark-to-book rate.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#2a3650]">
                    <th className="table-header w-8 px-2 md:px-4"></th>
                    <th className="table-header px-2 md:px-4">Commodity</th>
                    <th className="table-header px-2 md:px-4">Receipt Date</th>
                    <th className="table-header text-right px-2 md:px-4">INR Receivable</th>
                    <th className="table-header text-right px-2 md:px-4">Hedged INR</th>
                    <th className="table-header text-right px-2 md:px-4">USD at Book</th>
                    <th className="table-header text-right px-2 md:px-4">USD at Scenario</th>
                    <th className="table-header text-right px-2 md:px-4">vs Book</th>
                    <th className="table-header text-right px-2 md:px-4">Hedge +/-</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3650]/50">
                  {analysis.tradeResults.map((t) => (
                    <tr key={t.tradeId} className={`hover:bg-[#1e2a3f] transition-colors ${selectedIds.has(t.tradeId) ? "bg-blue-500/5" : ""}`}>
                      <td className="table-cell px-2 md:px-4">
                        <input type="checkbox" checked={selectedIds.has(t.tradeId)} onChange={() => toggleTrade(t.tradeId)} className="accent-blue-500 w-3 h-3" />
                      </td>
                      <td className="table-cell text-slate-200 text-xs px-2 md:px-4">{t.baseCommodity}</td>
                      <td className="table-cell font-mono text-slate-400 text-xs px-2 md:px-4">{t.inrSaleDate}</td>
                      <td className="table-cell font-mono text-amber-400 text-xs text-right px-2 md:px-4">{formatINR(t.inrSale)}</td>
                      <td className="table-cell font-mono text-xs text-right px-2 md:px-4">
                        <span className={t.hedgedInr > 0 ? "text-green-400" : "text-slate-600"}>{formatINR(t.hedgedInr)}</span>
                      </td>
                      <td className="table-cell font-mono text-slate-400 text-xs text-right px-2 md:px-4">{formatUSD(t.usdAtBook)}</td>
                      <td className="table-cell font-mono text-slate-200 text-xs text-right px-2 md:px-4">{formatUSD(t.usdWithHedge)}</td>
                      <td className={`table-cell font-mono text-xs text-right font-semibold px-2 md:px-4 ${t.pnlVsBook > 0.5 ? "text-green-400" : t.pnlVsBook < -0.5 ? "text-red-400" : "text-slate-600"}`}>
                        {t.pnlVsBook > 0.5 ? "+" : ""}{Math.abs(t.pnlVsBook) < 0.5 ? "$0" : formatUSD(t.pnlVsBook)}
                      </td>
                      <td className={`table-cell font-mono text-xs text-right px-2 md:px-4 ${t.hedgeBenefit > 0.5 ? "text-green-400" : t.hedgeBenefit < -0.5 ? "text-red-400" : "text-slate-600"}`}>
                        {t.hedgeBenefit > 0.5 ? "+" : ""}{Math.abs(t.hedgeBenefit) < 0.5 ? "$0" : formatUSD(t.hedgeBenefit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#2a3650] bg-[#111827]">
                    <td className="table-cell px-2 md:px-4" colSpan={3}>
                      <span className="text-xs font-semibold text-slate-400">Total ({analysis.tradeResults.length})</span>
                    </td>
                    <td className="table-cell font-mono text-amber-400 text-xs text-right font-bold px-2 md:px-4">{formatINR(analysis.totalInr)}</td>
                    <td className="table-cell font-mono text-xs text-right font-bold px-2 md:px-4">
                      <span className={analysis.totalHedgedInr > 0 ? "text-green-400" : "text-slate-600"}>{formatINR(analysis.totalHedgedInr)}</span>
                    </td>
                    <td className="table-cell font-mono text-slate-400 text-xs text-right font-bold px-2 md:px-4">{formatUSD(analysis.totalUsdAtBook)}</td>
                    <td className="table-cell font-mono text-slate-200 text-xs text-right font-bold px-2 md:px-4">{formatUSD(analysis.totalUsdWithHedge)}</td>
                    <td className={`table-cell font-mono text-xs text-right font-bold px-2 md:px-4 ${analysis.totalPnlVsBook >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {analysis.totalPnlVsBook >= 0 ? "+" : ""}{formatUSD(analysis.totalPnlVsBook)}
                    </td>
                    <td className={`table-cell font-mono text-xs text-right font-bold px-2 md:px-4 ${analysis.totalHedgeBenefit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {analysis.totalHedgeBenefit >= 0 ? "+" : ""}{formatUSD(analysis.totalHedgeBenefit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="px-3 md:px-4 py-2 border-t border-[#2a3650]/50 text-[8px] md:text-[9px] text-slate-600">
              <span className="font-semibold text-slate-500">vs Book</span> = USD at scenario (w/ hedges) &minus; USD at book rate. Positive = beating the trader&apos;s booked rate.{" "}
              <span className="font-semibold text-slate-500">Hedge +/-</span> = benefit of hedges vs unhedged at scenario.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
