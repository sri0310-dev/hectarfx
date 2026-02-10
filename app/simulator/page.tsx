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
  mode: "USD" | "INR"; // NEW: choose input mode
  amount: string;      // Input amount (either USD or INR based on mode)
  rate: string;
  expiry: string;
};

// Smart number parser: "2cr" → 20000000, "2l" → 200000, "80k" → 80000
function parseSmartNumber(input: string): number {
  const s = input.trim().toLowerCase();
  if (!s) return 0;

  // Match number followed by optional suffix
  const match = s.match(/^([\d.,]+)\s*(cr|crore|l|lakh|lakhs|k|m|million)?$/i);
  if (!match) return parseFloat(s.replace(/,/g, "")) || 0;

  const num = parseFloat(match[1].replace(/,/g, "")) || 0;
  const suffix = (match[2] || "").toLowerCase();

  switch (suffix) {
    case "cr":
    case "crore":
      return num * 10000000; // 1 crore = 10 million
    case "l":
    case "lakh":
    case "lakhs":
      return num * 100000;
    case "k":
      return num * 1000;
    case "m":
    case "million":
      return num * 1000000;
    default:
      return num;
  }
}

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
  const [liveGhsRate, setLiveGhsRate] = useState<number | null>(null);

  // Quick Compare popup state
  const [showCompare, setShowCompare] = useState(false);
  const [compareAmount, setCompareAmount] = useState("1cr");
  const [compareRates, setCompareRates] = useState<string[]>([]);
  const [compareFromCurrency, setCompareFromCurrency] = useState<"INR" | "USD">("INR");
  const [compareToCurrency, setCompareToCurrency] = useState<"USD" | "INR" | "GHS">("USD");
  // GHS rate (USD to Ghana Cedi) - from API or user edit
  const [ghsRate, setGhsRate] = useState("15.50");
  const [compareRatesInitialized, setCompareRatesInitialized] = useState(false);

  // Generate default compare rates based on spot (spot, spot+0.10, spot+0.20)
  function getDefaultRates(spot: number): string[] {
    return [
      spot.toFixed(2),
      (spot + 0.10).toFixed(2),
      (spot + 0.20).toFixed(2),
    ];
  }

  // Generate default GHS compare rates based on GHS rate
  function getDefaultGhsRates(rate: number): string[] {
    return [
      rate.toFixed(2),
      (rate + 0.10).toFixed(2),
      (rate + 0.20).toFixed(2),
    ];
  }

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
      if (data.fx?.spot) {
        setLiveSpot(data.fx.spot);
        setFxSource(data.source || "");
      }
      if (data.ghsRate) {
        setLiveGhsRate(data.ghsRate);
        setGhsRate(data.ghsRate.toFixed(2));
      }
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
      // Initialize compare rates based on live spot
      if (!compareRatesInitialized) {
        setCompareRates(getDefaultRates(spot));
        setCompareRatesInitialized(true);
      }
      // Get GHS rate from API
      if (fd.ghsRate) {
        setLiveGhsRate(fd.ghsRate);
        setGhsRate(fd.ghsRate.toFixed(2));
      }
      setActiveHedges((hd.hedges || []).filter((h: ActiveHedge) => h.status === "ACTIVE"));
      setLoading(false);
    });
    const interval = setInterval(fetchFx, 60_000);
    return () => clearInterval(interval);
  }, [fetchFx, compareRatesInitialized]);

  // Sim hedge management
  function addSimHedge() {
    setSimHedges((prev) => [...prev, { id: simIdCounter++, mode: "INR", amount: "", rate: "", expiry: "" }]);
  }
  function removeSimHedge(id: number) {
    setSimHedges((prev) => prev.filter((h) => h.id !== id));
  }
  function updateSimHedge(id: number, field: keyof Omit<SimHedge, "id">, value: string) {
    setSimHedges((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  }
  function toggleSimHedgeMode(id: number) {
    setSimHedges((prev) => prev.map((h) => (h.id === id ? { ...h, mode: h.mode === "USD" ? "INR" : "USD", amount: "" } : h)));
  }
  // Calculate INR amount from sim hedge (handles both USD and INR modes)
  function getSimHedgeInr(h: SimHedge): number {
    const amt = parseSmartNumber(h.amount);
    const rate = parseFloat(h.rate) || 0;
    if (h.mode === "USD") {
      return amt * rate; // USD * rate = INR
    }
    return amt; // Already INR
  }
  // Calculate USD amount from sim hedge
  function getSimHedgeUsd(h: SimHedge): number {
    const amt = parseSmartNumber(h.amount);
    const rate = parseFloat(h.rate) || 0;
    if (h.mode === "USD") {
      return amt; // Already USD
    }
    return rate > 0 ? amt / rate : 0; // INR / rate = USD
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
      const inrAmt = getSimHedgeInr(h);
      const rate = parseFloat(h.rate) || 0;
      if (inrAmt > 0 && rate > 0) allHedges.push({ amountInr: inrAmt, rate, expiry: h.expiry || "" });
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
    return <div className="flex items-center justify-center h-96"><div style={{ color: "var(--text-secondary)" }}>Loading simulator...</div></div>;
  }
  if (!analysis) return null;

  return (
    <div className="max-w-[1400px]">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Simulator</h1>
          <p className="text-sm md:text-base mt-1" style={{ color: "var(--text-secondary)" }}>
            {trades.length} trades &middot; {formatUSD(analysis.totalUsdExposure)} exposure
            &middot; {activeHedges.length} active hedge{activeHedges.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCompare(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "var(--accent-purple)", color: "white" }}
        >
          Quick Compare
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-5">
        {/* ═══ LEFT PANE ═══ */}
        <div className="lg:col-span-4 space-y-3">

          {/* Current Position */}
          <div className="card py-4 px-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Current Position</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Mark-to-Book</span>
                <span className="font-mono text-lg font-bold" style={{ color: "var(--accent-amber)" }}>{analysis.blendedMtb.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Live Spot</span>
                <div className="text-right">
                  <span className="font-mono text-lg font-bold" style={{ color: "var(--accent-cyan)" }}>{liveSpot.toFixed(4)}</span>
                  {fxSource && <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>({fxSource})</span>}
                </div>
              </div>
              <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>vs Book P&L</span>
                  <span className="font-mono text-lg font-bold" style={{ color: analysis.totalPnlVsBook >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                    {analysis.totalPnlVsBook >= 0 ? "+" : ""}{formatUSD(analysis.totalPnlVsBook)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Scenario Spot */}
          <div className="card py-4 px-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Scenario USDINR</h3>
            <input
              type="number"
              step="0.01"
              className="input-field text-center text-2xl font-bold w-full mb-3"
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
            <div className="flex gap-2 mt-3">
              {[-2, -1, 0, +1, +2].map((delta) => (
                <button
                  key={delta}
                  onClick={() => setScenarioSpot((liveSpot + delta).toFixed(4))}
                  className="flex-1 text-sm py-1.5 rounded font-medium transition-all"
                  style={{
                    border: `1px solid ${Math.abs(Number(scenarioSpot) - (liveSpot + delta)) < 0.01 ? "var(--accent-blue)" : "var(--border)"}`,
                    background: Math.abs(Number(scenarioSpot) - (liveSpot + delta)) < 0.01 ? "var(--accent-blue)" : "transparent",
                    color: Math.abs(Number(scenarioSpot) - (liveSpot + delta)) < 0.01 ? "white" : "var(--text-secondary)",
                  }}
                >
                  {delta === 0 ? "Spot" : delta > 0 ? `+${delta}` : `${delta}`}
                </button>
              ))}
            </div>
          </div>

          {/* Active Hedges */}
          <div className="card py-4 px-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Active Hedges ({activeHedges.length})
              </h3>
              <Link href="/hedges" className="text-sm font-medium" style={{ color: "var(--accent-blue)" }}>Manage &rarr;</Link>
            </div>
            {activeHedges.length > 0 ? (
              <div className="space-y-2">
                {activeHedges.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-sm py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <span className="font-mono font-medium" style={{ color: "var(--accent-cyan)" }}>{formatUSD(h.usdAmount)}</span>
                      <span className="mx-2" style={{ color: "var(--text-muted)" }}>@</span>
                      <span className="font-mono font-medium" style={{ color: "var(--accent-amber)" }}>{h.rate.toFixed(4)}</span>
                    </div>
                    <span className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>{h.settlementDate}</span>
                  </div>
                ))}
                <div className="text-sm pt-2" style={{ color: "var(--text-secondary)" }}>
                  Total: <strong style={{ color: "var(--accent-amber)" }}>{formatINR(activeHedges.reduce((s, h) => s + h.inrAmount, 0))}</strong> @ <strong>{analysis.weightedAvgHedgeRate.toFixed(4)}</strong> avg
                </div>
              </div>
            ) : (
              <p className="text-sm py-2" style={{ color: "var(--text-muted)" }}>No active hedges. <Link href="/hedges" style={{ color: "var(--accent-blue)" }}>Add one</Link></p>
            )}
          </div>

          {/* Simulation Hedges */}
          <div className="card py-3 px-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Simulation Hedges</h3>
              <button onClick={addSimHedge} className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded px-2 py-1 font-medium">+ Add Hedge</button>
            </div>
            {simHedges.length > 0 ? (
              <div className="space-y-3">
                {simHedges.map((h) => {
                  const inrVal = getSimHedgeInr(h);
                  const usdVal = getSimHedgeUsd(h);
                  const rate = parseFloat(h.rate) || 0;
                  return (
                    <div key={h.id} className="p-3 rounded-lg" style={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between mb-2">
                        {/* USD/INR Toggle */}
                        <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          <button
                            onClick={() => h.mode !== "USD" && toggleSimHedgeMode(h.id)}
                            className="px-3 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: h.mode === "USD" ? "var(--accent-blue)" : "transparent",
                              color: h.mode === "USD" ? "white" : "var(--text-muted)",
                            }}
                          >
                            USD
                          </button>
                          <button
                            onClick={() => h.mode !== "INR" && toggleSimHedgeMode(h.id)}
                            className="px-3 py-1 text-xs font-medium transition-colors"
                            style={{
                              background: h.mode === "INR" ? "var(--accent-blue)" : "transparent",
                              color: h.mode === "INR" ? "white" : "var(--text-muted)",
                            }}
                          >
                            INR
                          </button>
                        </div>
                        <button onClick={() => removeSimHedge(h.id)} className="text-xs px-2 py-1 rounded hover:bg-red-500/20" style={{ color: "var(--accent-red)" }}>Remove</button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>
                            {h.mode === "USD" ? "USD Amount" : "INR Amount"}
                          </label>
                          <input
                            type="text"
                            className="input-field text-sm py-2 font-mono"
                            placeholder={h.mode === "USD" ? "80k or 80000" : "2cr or 2l"}
                            value={h.amount}
                            onChange={(e) => updateSimHedge(h.id, "amount", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Rate</label>
                          <input
                            type="number"
                            step="0.01"
                            className="input-field text-sm py-2 font-mono"
                            placeholder="90.50"
                            value={h.rate}
                            onChange={(e) => updateSimHedge(h.id, "rate", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Expiry</label>
                          <input
                            type="date"
                            className="input-field text-sm py-2"
                            value={h.expiry}
                            onChange={(e) => updateSimHedge(h.id, "expiry", e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Computed values */}
                      {rate > 0 && parseSmartNumber(h.amount) > 0 && (
                        <div className="mt-2 pt-2 flex gap-4 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                          <span style={{ color: "var(--text-muted)" }}>
                            {h.mode === "USD" ? "INR locked:" : "USD equivalent:"}
                          </span>
                          <span className="font-mono font-medium" style={{ color: h.mode === "USD" ? "var(--accent-amber)" : "var(--accent-cyan)" }}>
                            {h.mode === "USD" ? formatINR(inrVal) : formatUSD(usdVal)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
                No simulation hedges. Click <strong>&quot;+ Add Hedge&quot;</strong> for what-if analysis.
              </p>
            )}
            <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
              <strong>Tip:</strong> Use shortcuts like <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg-card)" }}>2cr</code>, <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg-card)" }}>50l</code>, <code className="px-1 py-0.5 rounded" style={{ background: "var(--bg-card)" }}>80k</code> for amounts.
            </p>
          </div>
        </div>

        {/* ═══ RIGHT PANE ═══ */}
        <div className="lg:col-span-8 space-y-3">

          {/* Compact Results */}
          <div className="card py-4 px-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Results</h3>
              <span className="text-sm font-mono rounded px-3 py-1" style={{ color: "var(--text-secondary)", background: "var(--bg-card-hover)", border: "1px solid var(--border)" }}>
                {analysis.scopeLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>INR Receivables</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: "var(--accent-amber)" }}>{formatINR(analysis.totalInr)}</div>
              </div>
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>INR Hedged</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: "var(--accent-cyan)" }}>{formatINR(analysis.totalHedgedInr)}</div>
                {analysis.weightedAvgHedgeRate > 0 && (
                  <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>@ {analysis.weightedAvgHedgeRate.toFixed(2)}</div>
                )}
              </div>
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>USD at Book</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: "var(--text-secondary)" }}>{formatUSD(analysis.totalUsdAtBook)}</div>
              </div>
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>USD at Scenario</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: "var(--text-primary)" }}>{formatUSD(analysis.totalUsdWithHedge)}</div>
              </div>
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>vs Book P&L</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: analysis.totalPnlVsBook >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {analysis.totalPnlVsBook >= 0 ? "+" : ""}{formatUSD(analysis.totalPnlVsBook)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>Hedge Benefit</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: analysis.totalHedgeBenefit >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {analysis.totalHedgeBenefit >= 0 ? "+" : ""}{formatUSD(analysis.totalHedgeBenefit)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase mb-1" style={{ color: "var(--text-muted)" }}>Eff. Rate</div>
                <div className="text-base md:text-lg font-bold font-mono" style={{ color: "var(--accent-cyan)" }}>{analysis.effectiveAvgRate.toFixed(4)}</div>
              </div>
            </div>
          </div>

          {/* Trade-Level View */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-primary)" }}>Trade-Level View</div>

              {/* Filter controls - stacks on mobile */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Select by</span>
                  <select
                    className="select-field text-sm py-2 px-3 w-auto"
                    value={selectBy}
                    onChange={(e) => setSelectBy(e.target.value as "manual" | "month" | "commodity")}
                  >
                    <option value="manual">Manual (checkboxes)</option>
                    <option value="month">Month</option>
                    <option value="commodity">Commodity</option>
                  </select>
                </div>

                {selectBy === "month" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Month</span>
                    <select className="select-field text-sm py-2 px-3 w-auto" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                      <option value="">All</option>
                      {availableMonths.map((m) => {
                        const d = new Date(m + "-01");
                        return <option key={m} value={m}>{d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</option>;
                      })}
                    </select>
                    <button onClick={applyFilter} className="text-sm px-3 py-2 rounded font-medium" style={{ border: "1px solid var(--accent-blue)", color: "var(--accent-blue)" }}>Apply</button>
                  </div>
                )}

                {selectBy === "commodity" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Commodity</span>
                    <select className="select-field text-sm py-2 px-3 w-auto" value={filterCommodity} onChange={(e) => setFilterCommodity(e.target.value)}>
                      <option value="">All</option>
                      {availableCommodities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={applyFilter} className="text-sm px-3 py-2 rounded font-medium" style={{ border: "1px solid var(--accent-blue)", color: "var(--accent-blue)" }}>Apply</button>
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-sm font-mono rounded px-2 py-1" style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    Selected: {selectedIds.size}
                  </span>
                  <button onClick={applySelection} disabled={selectedIds.size === 0}
                    className="text-sm px-3 py-1.5 rounded font-medium"
                    style={{
                      border: `1px solid ${selectedIds.size > 0 ? "var(--accent-blue)" : "var(--border)"}`,
                      color: selectedIds.size > 0 ? "var(--accent-blue)" : "var(--text-muted)",
                      cursor: selectedIds.size > 0 ? "pointer" : "not-allowed",
                    }}>Apply</button>
                  <button onClick={clearSelection} className="text-sm px-3 py-1.5 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Clear</button>
                  <button onClick={selectAll} className="text-sm px-3 py-1.5 rounded" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Select all</button>
                </div>
              </div>

              <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
                If nothing selected, scope = <strong style={{ color: "var(--text-primary)" }}>All trades</strong>. North Star: beat the mark-to-book rate.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="py-3 px-4 text-left text-sm font-semibold" style={{ color: "var(--text-muted)" }}></th>
                    <th className="py-3 px-4 text-left text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Commodity</th>
                    <th className="py-3 px-4 text-left text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Receipt Date</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>INR Receivable</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Hedged INR</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>USD at Book</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>USD at Scenario</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>vs Book</th>
                    <th className="py-3 px-4 text-right text-sm font-semibold" style={{ color: "var(--text-muted)" }}>Hedge +/-</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.tradeResults.map((t) => (
                    <tr key={t.tradeId} className="transition-colors" style={{ borderBottom: "1px solid var(--border)", background: selectedIds.has(t.tradeId) ? "rgba(59, 130, 246, 0.05)" : "transparent" }}>
                      <td className="py-3 px-4">
                        <input type="checkbox" checked={selectedIds.has(t.tradeId)} onChange={() => toggleTrade(t.tradeId)} className="accent-blue-500 w-4 h-4" />
                      </td>
                      <td className="py-3 px-4 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.baseCommodity}</td>
                      <td className="py-3 px-4 font-mono text-sm" style={{ color: "var(--text-secondary)" }}>{t.inrSaleDate}</td>
                      <td className="py-3 px-4 font-mono text-sm text-right font-medium" style={{ color: "var(--accent-amber)" }}>{formatINR(t.inrSale)}</td>
                      <td className="py-3 px-4 font-mono text-sm text-right">
                        <span style={{ color: t.hedgedInr > 0 ? "var(--accent-green)" : "var(--text-muted)" }}>{formatINR(t.hedgedInr)}</span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-right" style={{ color: "var(--text-secondary)" }}>{formatUSD(t.usdAtBook)}</td>
                      <td className="py-3 px-4 font-mono text-sm text-right font-medium" style={{ color: "var(--text-primary)" }}>{formatUSD(t.usdWithHedge)}</td>
                      <td className="py-3 px-4 font-mono text-sm text-right font-bold" style={{ color: t.pnlVsBook > 0.5 ? "var(--accent-green)" : t.pnlVsBook < -0.5 ? "var(--accent-red)" : "var(--text-muted)" }}>
                        {t.pnlVsBook > 0.5 ? "+" : ""}{Math.abs(t.pnlVsBook) < 0.5 ? "$0" : formatUSD(t.pnlVsBook)}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-right" style={{ color: t.hedgeBenefit > 0.5 ? "var(--accent-green)" : t.hedgeBenefit < -0.5 ? "var(--accent-red)" : "var(--text-muted)" }}>
                        {t.hedgeBenefit > 0.5 ? "+" : ""}{Math.abs(t.hedgeBenefit) < 0.5 ? "$0" : formatUSD(t.hedgeBenefit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--bg-secondary)" }}>
                    <td className="py-3 px-4" colSpan={3}>
                      <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>Total ({analysis.tradeResults.length})</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-right font-bold" style={{ color: "var(--accent-amber)" }}>{formatINR(analysis.totalInr)}</td>
                    <td className="py-3 px-4 font-mono text-sm text-right font-bold">
                      <span style={{ color: analysis.totalHedgedInr > 0 ? "var(--accent-green)" : "var(--text-muted)" }}>{formatINR(analysis.totalHedgedInr)}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-right font-bold" style={{ color: "var(--text-secondary)" }}>{formatUSD(analysis.totalUsdAtBook)}</td>
                    <td className="py-3 px-4 font-mono text-sm text-right font-bold" style={{ color: "var(--text-primary)" }}>{formatUSD(analysis.totalUsdWithHedge)}</td>
                    <td className="py-3 px-4 font-mono text-sm text-right font-bold" style={{ color: analysis.totalPnlVsBook >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {analysis.totalPnlVsBook >= 0 ? "+" : ""}{formatUSD(analysis.totalPnlVsBook)}
                    </td>
                    <td className="py-3 px-4 font-mono text-sm text-right font-bold" style={{ color: analysis.totalHedgeBenefit >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {analysis.totalHedgeBenefit >= 0 ? "+" : ""}{formatUSD(analysis.totalHedgeBenefit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="px-4 py-3 text-sm" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>vs Book</span> = USD at scenario (w/ hedges) − USD at book rate. Positive = beating the trader&apos;s booked rate.{" "}
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Hedge +/-</span> = benefit of hedges vs unhedged at scenario.
            </div>
          </div>
        </div>
      </div>

      {/* Quick Compare Modal */}
      {showCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-lg rounded-xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Quick Rate Compare</h2>
              <button onClick={() => setShowCompare(false)} className="text-2xl leading-none" style={{ color: "var(--text-muted)" }}>&times;</button>
            </div>

            {/* Currency Direction Selector */}
            <div className="mb-4 p-3 rounded-lg" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>From</label>
                  <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    <button
                      onClick={() => {
                        if (compareFromCurrency !== "INR") {
                          setCompareFromCurrency("INR");
                          setCompareToCurrency("USD");
                          // Reset to INR defaults: 1cr, USD/INR rates
                          setCompareAmount("1cr");
                          setCompareRates(getDefaultRates(liveSpot));
                        }
                      }}
                      className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        background: compareFromCurrency === "INR" ? "var(--accent-amber)" : "transparent",
                        color: compareFromCurrency === "INR" ? "white" : "var(--text-muted)",
                      }}
                    >
                      INR
                    </button>
                    <button
                      onClick={() => {
                        if (compareFromCurrency !== "USD") {
                          setCompareFromCurrency("USD");
                          setCompareToCurrency("INR");
                          // Reset to USD defaults: $100k, USD/INR rates
                          setCompareAmount("100k");
                          setCompareRates(getDefaultRates(liveSpot));
                        }
                      }}
                      className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        background: compareFromCurrency === "USD" ? "var(--accent-cyan)" : "transparent",
                        color: compareFromCurrency === "USD" ? "white" : "var(--text-muted)",
                      }}
                    >
                      USD
                    </button>
                  </div>
                </div>

                <div className="pt-5" style={{ color: "var(--text-muted)" }}>→</div>

                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>To</label>
                  <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    {compareFromCurrency === "INR" ? (
                      <button
                        className="flex-1 px-3 py-2 text-sm font-medium"
                        style={{ background: "var(--accent-cyan)", color: "white" }}
                      >
                        USD
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            if (compareToCurrency !== "INR") {
                              setCompareToCurrency("INR");
                              // Reset to USD/INR rates
                              setCompareRates(getDefaultRates(liveSpot));
                            }
                          }}
                          className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                          style={{
                            background: compareToCurrency === "INR" ? "var(--accent-amber)" : "transparent",
                            color: compareToCurrency === "INR" ? "white" : "var(--text-muted)",
                          }}
                        >
                          INR
                        </button>
                        <button
                          onClick={() => {
                            if (compareToCurrency !== "GHS") {
                              setCompareToCurrency("GHS");
                              // Reset to USD/GHS rates
                              const baseGhs = liveGhsRate || parseFloat(ghsRate) || 15.50;
                              setCompareRates(getDefaultGhsRates(baseGhs));
                            }
                          }}
                          className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                          style={{
                            background: compareToCurrency === "GHS" ? "var(--accent-green)" : "transparent",
                            color: compareToCurrency === "GHS" ? "white" : "var(--text-muted)",
                          }}
                        >
                          GHS
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* GHS Rate input when converting to Cedi */}
              {compareFromCurrency === "USD" && compareToCurrency === "GHS" && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>USD/GHS Base Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        className="input-field text-sm font-mono py-2 w-32"
                        value={ghsRate}
                        onChange={(e) => setGhsRate(e.target.value)}
                        placeholder="15.50"
                      />
                    </div>
                    {liveGhsRate && (
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Live: <span className="font-mono" style={{ color: "var(--accent-green)" }}>{liveGhsRate.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-sm mb-2 block" style={{ color: "var(--text-secondary)" }}>
                {compareFromCurrency === "INR" ? "INR Amount (use shortcuts: 1cr, 50l, etc.)" : "USD Amount (use shortcuts: 80k, 1m, etc.)"}
              </label>
              <input
                type="text"
                className="input-field text-lg font-mono py-3"
                placeholder={compareFromCurrency === "INR" ? "1cr" : "100k"}
                value={compareAmount}
                onChange={(e) => setCompareAmount(e.target.value)}
              />
              {parseSmartNumber(compareAmount) > 0 && (
                <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  = {compareFromCurrency === "INR" ? formatINR(parseSmartNumber(compareAmount)) : formatUSD(parseSmartNumber(compareAmount))}
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-sm mb-2 block" style={{ color: "var(--text-secondary)" }}>
                {compareFromCurrency === "INR" ? "USD/INR Rates to Compare" : compareToCurrency === "INR" ? "USD/INR Rates to Compare" : "USD/GHS Rates to Compare"}
              </label>
              <div className="space-y-2">
                {compareRates.map((rate, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      className="input-field text-base font-mono py-2 flex-1"
                      placeholder={compareToCurrency === "GHS" ? "15.50" : "90.50"}
                      value={rate}
                      onChange={(e) => {
                        const newRates = [...compareRates];
                        newRates[idx] = e.target.value;
                        setCompareRates(newRates);
                      }}
                    />
                    {compareRates.length > 2 && (
                      <button
                        onClick={() => setCompareRates(compareRates.filter((_, i) => i !== idx))}
                        className="px-3 rounded"
                        style={{ color: "var(--accent-red)", border: "1px solid var(--border)" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setCompareRates([...compareRates, ""])}
                className="text-sm mt-2 px-3 py-1 rounded"
                style={{ color: "var(--accent-blue)", border: "1px solid var(--accent-blue)" }}
              >
                + Add Rate
              </button>
            </div>

            {/* Results */}
            {parseSmartNumber(compareAmount) > 0 && compareRates.some(r => parseFloat(r) > 0) && (
              <div className="rounded-lg p-4 mb-4" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                <div className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  {compareFromCurrency === "INR"
                    ? `${formatINR(parseSmartNumber(compareAmount))} converts to:`
                    : `${formatUSD(parseSmartNumber(compareAmount))} converts to:`
                  }
                </div>
                <div className="space-y-3">
                  {compareRates.map((rateStr, idx) => {
                    const rate = parseFloat(rateStr) || 0;
                    if (rate <= 0) return null;
                    const sourceAmount = parseSmartNumber(compareAmount);

                    // Calculate based on direction
                    let result: number;
                    let resultLabel: string;
                    let resultColor: string;

                    if (compareFromCurrency === "INR") {
                      // INR → USD: divide by rate
                      result = sourceAmount / rate;
                      resultLabel = `$${result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      resultColor = "var(--accent-cyan)";
                    } else if (compareToCurrency === "INR") {
                      // USD → INR: multiply by rate
                      result = sourceAmount * rate;
                      resultLabel = formatINR(result);
                      resultColor = "var(--accent-amber)";
                    } else {
                      // USD → GHS: multiply by rate
                      result = sourceAmount * rate;
                      resultLabel = `GHS ${result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                      resultColor = "var(--accent-green)";
                    }

                    // Calculate difference from first rate
                    const baseRate = parseFloat(compareRates[0]) || 0;
                    let baseResult: number;
                    if (compareFromCurrency === "INR") {
                      baseResult = baseRate > 0 ? sourceAmount / baseRate : 0;
                    } else {
                      baseResult = baseRate > 0 ? sourceAmount * baseRate : 0;
                    }
                    const diff = result - baseResult;

                    return (
                      <div key={idx} className="flex items-center justify-between py-2" style={{ borderBottom: idx < compareRates.length - 1 ? "1px solid var(--border)" : "none" }}>
                        <div>
                          <span className="text-lg font-mono font-bold" style={{ color: "var(--accent-amber)" }}>{rate.toFixed(4)}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-mono font-bold" style={{ color: resultColor }}>
                            {resultLabel}
                          </div>
                          {idx > 0 && baseResult > 0 && (
                            <div className="text-sm font-mono" style={{ color: diff >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                              {diff >= 0 ? "+" : ""}
                              {compareFromCurrency === "INR"
                                ? `$${diff.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : compareToCurrency === "INR"
                                  ? formatINR(diff)
                                  : `GHS ${diff.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              } vs first
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary comparison */}
                {compareRates.filter(r => parseFloat(r) > 0).length >= 2 && (() => {
                  const sourceAmount = parseSmartNumber(compareAmount);
                  const validRates = compareRates.map(r => parseFloat(r) || 0).filter(r => r > 0);
                  const minRate = Math.min(...validRates);
                  const maxRate = Math.max(...validRates);

                  let resultAtMin: number;
                  let resultAtMax: number;
                  let totalDiff: number;
                  let currencySymbol: string;
                  let diffLabel: string;

                  if (compareFromCurrency === "INR") {
                    // INR → USD: lower rate = more USD
                    resultAtMin = sourceAmount / minRate;
                    resultAtMax = sourceAmount / maxRate;
                    totalDiff = resultAtMin - resultAtMax;
                    currencySymbol = "$";
                    diffLabel = totalDiff >= 0 ? "more at lower rate" : "less at lower rate";
                  } else {
                    // USD → INR/GHS: higher rate = more target currency
                    resultAtMin = sourceAmount * minRate;
                    resultAtMax = sourceAmount * maxRate;
                    totalDiff = resultAtMax - resultAtMin;
                    currencySymbol = compareToCurrency === "INR" ? "₹" : "GHS ";
                    diffLabel = totalDiff >= 0 ? "more at higher rate" : "less at higher rate";
                  }

                  return (
                    <div className="mt-4 pt-3" style={{ borderTop: "2px solid var(--border)" }}>
                      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                        Rate range: <strong style={{ color: "var(--text-primary)" }}>{minRate.toFixed(4)} → {maxRate.toFixed(4)}</strong>
                      </div>
                      <div className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                        Difference: <strong style={{ color: "var(--accent-green)" }}>
                          {currencySymbol}{Math.abs(totalDiff).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </strong> {diffLabel}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCompare(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: "var(--bg-card-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
